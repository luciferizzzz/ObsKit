const { normalizeNoteRef } = require("../utils/relationship/validator");
const { getSectionContent } = require("../utils/relationship/parser");
const {
    isEmptyNote,
    countPendingTasks,
    hasMalformedFrontmatter,
    STALE_DAYS,
    LARGE_NOTE_BYTES,
} = require("./health");
const { findRelatedNotes, titleTokens } = require("./related");

const SIMILARITY_THRESHOLD = 0.5;
const MAX_LINK_SUGGESTIONS = 3;

function tokensSet(tokens) {
    return new Set(tokens);
}

function jaccard(a, b) {
    const setA = a instanceof Set ? a : new Set(a);
    const setB = b instanceof Set ? b : new Set(b);

    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

    const union = new Set([...setA, ...setB]);
    const intersection = new Set([...setA].filter((value) => setB.has(value)));

    return intersection.size / union.size;
}

function sameFile(a, b) {
    return a.file === b.file;
}

function findDuplicateTitle(index, note) {
    for (const other of index.notes) {
        if (sameFile(other, note)) {
            continue;
        }

        const a = note.name.toLocaleLowerCase().replace(/[^a-z0-9]+/gi, "");
        const b = other.name.toLocaleLowerCase().replace(/[^a-z0-9]+/gi, "");
        if (a === b) {
            return other;
        }
    }

    return null;
}

function findSimilarNote(index, note) {
    const tokens = titleTokens(note.name);
    let best = null;
    let bestScore = 0;

    for (const other of index.notes) {
        if (sameFile(other, note)) {
            continue;
        }

        const otherTokens = titleTokens(other.name);
        const score = jaccard(tokensSet(tokens), tokensSet(otherTokens));
        if (score > bestScore) {
            bestScore = score;
            best = other;
        }
    }

    if (best && bestScore >= SIMILARITY_THRESHOLD) {
        return best;
    }

    return null;
}

function buildSuggestions(index, targetRef) {
    const note = index.byName.get(normalizeNoteRef(targetRef));

    if (!note) {
        return { note: null, issues: [], opportunities: [] };
    }

    const issues = [];
    const opportunities = [];

    if (isEmptyNote(note.content)) {
        issues.push({
            type: "empty",
            message: "This note is empty. Add some content.",
        });
    }

    const duplicate = findDuplicateTitle(index, note);
    if (duplicate) {
        issues.push({
            type: "duplicate",
            message: `Duplicate title exists: ${duplicate.relPath}`,
            related: duplicate,
        });
    }

    const similar = findSimilarNote(index, note);
    if (similar) {
        issues.push({
            type: "similar",
            message: `Similar note exists: ${similar.relPath}`,
            related: similar,
        });
    }

    if (hasMalformedFrontmatter(note.content)) {
        issues.push({
            type: "frontmatter",
            message: "Frontmatter is opened but never closed.",
        });
    }

    if (note.tags.length === 0) {
        opportunities.push({
            type: "noTags",
            message: "This note has no tags. Add a tag to make it findable.",
        });
    }

    if (note.outgoing.length === 0) {
        opportunities.push({
            type: "noOutgoing",
            message: "This note has no outgoing links. Link it to another note.",
        });
    }

    if (note.backlinks.length === 0) {
        opportunities.push({
            type: "noBacklinks",
            message: "This note has no backlinks. Link to it from another note.",
        });
    }

    const staleDays = dayDifference(note.mtime, new Date());
    if (staleDays >= STALE_DAYS) {
        opportunities.push({
            type: "stale",
            message: `This note has not been updated in ${staleDays} days.`,
        });
    }

    if (note.size > LARGE_NOTE_BYTES) {
        opportunities.push({
            type: "large",
            message: "This note is quite large. Consider splitting it.",
        });
    }

    const pending = countPendingTasks(note.content);
    if (pending > 0) {
        opportunities.push({
            type: "pendingTasks",
            message: `This note has ${pending} open task(s).`,
        });
    }

    const related = findRelatedNotes(index, note.name, {
        limit: MAX_LINK_SUGGESTIONS,
    });

    const linkedTargets = new Set(note.outgoing);
    const relatedSection = getSectionContent(note.content, "Related") || "";

    for (const result of related.results) {
        const name = result.note.name.toLowerCase();
        if (
            linkedTargets.has(name) ||
            relatedSection.includes(result.note.name)
        ) {
            continue;
        }

        opportunities.push({
            type: "link",
            message: `Add a link to related note [[${result.note.name}]]`,
            related: result.note,
            score: result.score,
        });

        if (
            opportunities.filter((s) => s.type === "link").length >= MAX_LINK_SUGGESTIONS
        ) {
            break;
        }
    }

    return { note, issues, opportunities };
}

function dayDifference(mtime, now) {
    const diff = now.getTime() - new Date(mtime).getTime();
    return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

module.exports = {
    SIMILARITY_THRESHOLD,
    MAX_LINK_SUGGESTIONS,
    jaccard,
    findDuplicateTitle,
    findSimilarNote,
    buildSuggestions,
};