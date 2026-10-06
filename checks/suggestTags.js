const {
    dedupeRelated,
    isStrongRelationship,
} = require("../utils/relationship/relatedContext");

// Tag recommendations stay conservative on purpose: a note only learns a tag
// when it is used by more than one related note, or by a single related note
// that is joined by an explicit link. Weak signals (title overlap alone, a
// single shared tag) never qualify.
const MIN_TAG_SUPPORT = 2;
const MAX_TAG_SUGGESTIONS = 5;
const MAX_TAG_SOURCES = 3;

// The vault index already lowercases tags, but hand-built indexes may carry the
// display form, so the key is normalized defensively.
function tagKey(tag) {
    return String(tag || "")
        .replace(/^#+/, "")
        .trim()
        .toLowerCase();
}

function noteTagKeys(note) {
    const tags = note && Array.isArray(note.tags) ? note.tags : [];
    const keys = [];
    const seen = new Set();

    for (const tag of tags) {
        const key = tagKey(tag);
        if (!key || seen.has(key)) continue;

        seen.add(key);
        keys.push(key);
    }

    return keys;
}

function suggestTags(note, relatedResults, options = {}) {
    const minSupport = options.minSupport || MIN_TAG_SUPPORT;
    const limit = options.limit || MAX_TAG_SUGGESTIONS;
    const maxSources = options.maxSources || MAX_TAG_SOURCES;

    const own = new Set(noteTagKeys(note));
    const entries = new Map();

    for (const result of dedupeRelated(relatedResults)) {
        const related = result.note;
        const strong = isStrongRelationship(result);
        const tags = noteTagKeys(related);

        for (const tag of tags) {
            // Never recommend a tag the note already carries.
            if (own.has(tag)) {
                continue;
            }

            if (!entries.has(tag)) {
                entries.set(tag, {
                    tag,
                    score: 0,
                    support: 0,
                    strong: false,
                    sources: [],
                    sourceKeys: new Set(),
                });
            }

            const entry = entries.get(tag);
            entry.score += result.score || 0;
            entry.support += 1;
            entry.strong = entry.strong || strong;

            const key = String(related.relPath || related.name || "");
            if (key && !entry.sourceKeys.has(key)) {
                entry.sourceKeys.add(key);
                entry.sources.push(related.name);
            }
        }
    }

    const candidates = [...entries.values()].filter(
        (entry) => entry.support >= minSupport || entry.strong
    );

    candidates.sort(
        (a, b) =>
            b.score - a.score ||
            b.support - a.support ||
            a.tag.localeCompare(b.tag)
    );

    return candidates.slice(0, limit).map((entry) => ({
        tag: entry.tag,
        score: entry.score,
        support: entry.support,
        linked: entry.strong,
        sources: entry.sources.slice(0, maxSources).sort((a, b) => a.localeCompare(b)),
    }));
}

module.exports = {
    MIN_TAG_SUPPORT,
    MAX_TAG_SUGGESTIONS,
    MAX_TAG_SOURCES,
    tagKey,
    suggestTags,
};