const { normalizeNoteRef } = require("../utils/relationship/validator");
const {
    buildSimilarityIndex,
    findBodyMatches,
} = require("../utils/relationship/similarity");

const WEIGHTS = {
    backlink: 10,
    sharedLink: 3,
    sharedTag: 2,
    sharedBacklink: 2,
    titleToken: 1,
    // Body text is an implicit signal, not an author-declared one, so it is
    // tiered (see BODY_TIERS) and capped below a single explicit backlink.
    bodySimilarity: 2,
};

// Points awarded for a body-similarity tier, before WEIGHTS.bodySimilarity.
// The strongest tier (3 * 2 = 6) stays under one backlink (10) and matches two
// shared outgoing links, so prose can never outrank an explicit link.
const BODY_TIERS = [
    { min: 0.3, points: 3 },
    { min: 0.18, points: 2 },
    { min: 0.1, points: 1 },
];

const STOPWORDS = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "at",
    "for",
    "with",
]);

// Display order for the CLI, unchanged from v1.6.1 so existing output keeps
// its shape. Score accumulation order is the order reasons are pushed below.
const REASON_ORDER = [
    "sharedTag",
    "sharedLink",
    "backlink",
    "sharedBacklink",
    "titleToken",
    "bodySimilarity",
];

// The vault index is rebuilt per command, so cache the derived body tokens per
// index object instead of re-tokenizing for every lookup.
const similarityCache = new WeakMap();

function titleTokens(title) {
    return String(title)
        .toLowerCase()
        .split(/[\s\-_/\\,.!?()'"\[\]#:+]+/)
        .filter((token) => token.length > 1)
        .filter((token) => !STOPWORDS.has(token));
}

function intersect(a, b) {
    const setB = new Set(b);
    return a.filter((value) => setB.has(value)).sort();
}

// Backlink lists hold real filenames, so the same note can appear with
// different casing depending on which file referenced it.
function intersectNames(a, b) {
    const setB = new Set(b.map((name) => String(name).toLowerCase()));
    return a
        .filter((name) => setB.has(String(name).toLowerCase()))
        .sort();
}

function nameKey(name) {
    return String(name).toLowerCase();
}

// Two notes can share a basename that differs only in case ("Sub1/Note.md" and
// "Sub2/note.md"), so identity is the file path, not the name.
function isSameNote(a, b) {
    if (a.relPath && b.relPath) {
        return a.relPath === b.relPath;
    }
    return nameKey(a.name) === nameKey(b.name);
}

function getSimilarityIndex(index) {
    if (!index || !Array.isArray(index.notes)) {
        return null;
    }

    if (!similarityCache.has(index)) {
        similarityCache.set(index, buildSimilarityIndex(index.notes));
    }

    return similarityCache.get(index);
}

function bodySimilarityPoints(similarity) {
    for (const tier of BODY_TIERS) {
        if (similarity >= tier.min) {
            return tier.points * WEIGHTS.bodySimilarity;
        }
    }
    return 0;
}

function findRelatedNotes(index, targetRef, options = {}) {
    const target = index.byName.get(normalizeNoteRef(targetRef));

    if (!target) {
        return { target: null, results: [] };
    }

    const targetTokens = titleTokens(target.name);
    const targetTags = new Set(target.tags);
    const targetOutgoing = new Set(target.outgoing);
    const targetBacklinks = new Set(target.backlinks);
    const targetBacklinkKeys = new Set([...targetBacklinks].map(nameKey));
    const maxResults = options.limit || 10;
    const useBodySimilarity = options.bodySimilarity !== false;
    const results = [];

    // Body similarity is a candidate generator: only notes that already look
    // related through text are scored against the target's body. This keeps the
    // comparison bounded instead of O(N^2) across the vault.
    const bodyMatches = new Map();
    if (useBodySimilarity) {
        const similarityIndex = getSimilarityIndex(index);
        for (const match of findBodyMatches(similarityIndex, target, options)) {
            bodyMatches.set(match.relPath, match);
        }
    }

    for (const note of index.notes) {
        if (isSameNote(note, target)) {
            continue;
        }

        let score = 0;
        const reasons = [];

        if (targetBacklinkKeys.has(nameKey(note.name))) {
            score += WEIGHTS.backlink;
            reasons.push({
                type: "backlink",
                label: "Backlinks to this note",
                items: [],
            });
        }

        const sharedLinks = intersect([...note.outgoing], [...targetOutgoing]);
        if (sharedLinks.length > 0) {
            score += WEIGHTS.sharedLink * sharedLinks.length;
            reasons.push({
                type: "sharedLink",
                label: "Shared links",
                items: sharedLinks,
            });
        }

        const sharedTags = intersect(note.tags, [...targetTags]);
        if (sharedTags.length > 0) {
            score += WEIGHTS.sharedTag * sharedTags.length;
            reasons.push({
                type: "sharedTag",
                label: "Shared tags",
                items: sharedTags.map((tag) => "#" + tag),
            });
        }

        // Backlink lists are stored as names, so this is the only place where
        // a case-insensitive compare is needed. The filter is defence in depth:
        // the vault index already drops self-references, so it only matters for
        // indexes built by hand.
        const sharedBacklinks = intersectNames(
            [...note.backlinks],
            [...targetBacklinks]
        ).filter(
            (name) =>
                nameKey(name) !== nameKey(note.name) && nameKey(name) !== nameKey(target.name)
        );
        if (sharedBacklinks.length > 0) {
            score += WEIGHTS.sharedBacklink * sharedBacklinks.length;
            reasons.push({
                type: "sharedBacklink",
                label: "Referenced by",
                items: sharedBacklinks,
            });
        }

        const sharedTokens = intersect(titleTokens(note.name), targetTokens);
        if (sharedTokens.length > 0) {
            score += WEIGHTS.titleToken * sharedTokens.length;
            reasons.push({
                type: "titleToken",
                label: "Title overlap",
                items: sharedTokens,
            });
        }

        const bodyMatch = bodyMatches.get(note.relPath);
        if (bodyMatch) {
            const points = bodySimilarityPoints(bodyMatch.similarity);
            if (points > 0) {
                score += points;
                reasons.push({
                    type: "bodySimilarity",
                    label: "Similar body text",
                    items: bodyMatch.tokens,
                });
            }
        }

        if (score <= 0) {
            continue;
        }

        results.push({
            note,
            score,
            reasons,
        });
    }

    results.sort(
        (a, b) =>
            b.score - a.score ||
            a.note.name.localeCompare(b.note.name) ||
            a.note.relPath.localeCompare(b.note.relPath)
    );

    return {
        target,
        results: results.slice(0, maxResults),
    };
}

module.exports = {
    WEIGHTS,
    BODY_TIERS,
    REASON_ORDER,
    titleTokens,
    intersect,
    intersectNames,
    bodySimilarityPoints,
    findRelatedNotes,
};
