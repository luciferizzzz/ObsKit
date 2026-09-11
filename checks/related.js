const { normalizeNoteRef } = require("../utils/relationship/validator");

const WEIGHTS = {
    backlink: 10,
    sharedLink: 3,
    sharedTag: 2,
    sharedBacklink: 2,
    titleToken: 1,
};

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

function findRelatedNotes(index, targetRef, options = {}) {
    const target = index.byName.get(normalizeNoteRef(targetRef));

    if (!target) {
        return { target: null, results: [] };
    }

    const targetTokens = titleTokens(target.name);
    const targetTags = new Set(target.tags);
    const targetOutgoing = new Set(target.outgoing);
    const targetBacklinks = new Set(target.backlinks);
    const maxResults = options.limit || 10;
    const results = [];

    for (const note of index.notes) {
        if (note.name.toLowerCase() === target.name.toLowerCase()) {
            continue;
        }

        let score = 0;
        const reasons = [];

        if (target.backlinks.includes(note.name)) {
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

        const sharedBacklinks = intersect([...note.backlinks], [...targetBacklinks]).filter(
            (name) => name.toLowerCase() !== note.name.toLowerCase()
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
            a.note.name.localeCompare(b.note.name)
    );

    return {
        target,
        results: results.slice(0, maxResults),
    };
}

module.exports = {
    WEIGHTS,
    titleTokens,
    intersect,
    findRelatedNotes,
};