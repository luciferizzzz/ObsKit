const { folderOf, isSelfOrAncestor } = require("../utils/folders");
const {
    dedupeRelated,
    isStrongRelationship,
    reasonLabels,
} = require("../utils/relationship/relatedContext");

// Folder recommendations only ever name a folder that already exists in the
// vault: every candidate is derived from the relPath of a related note.
// Nothing is moved, created, or written.
const MIN_FOLDER_SUPPORT = 2;
const MAX_FOLDER_SUGGESTIONS = 3;
const MAX_FOLDER_SOURCES = 3;

// A related note inside "Projects/ObsKit/Backend" is evidence for that folder
// and for every folder above it, so a cluster nested three levels deep does not
// need three notes per level before it can be suggested. The vault root is
// never a candidate: it is not a folder a note can be moved into.
function folderAncestors(folder) {
    const parts = String(folder || "").split("/").filter(Boolean);
    const ancestors = [];

    for (let end = parts.length; end > 0; end -= 1) {
        ancestors.push(parts.slice(0, end).join("/"));
    }

    return ancestors;
}

function suggestFolders(note, relatedResults, options = {}) {
    const minSupport = options.minSupport || MIN_FOLDER_SUPPORT;
    const limit = options.limit || MAX_FOLDER_SUGGESTIONS;
    const maxSources = options.maxSources || MAX_FOLDER_SOURCES;

    const ownFolder = folderOf(note && note.relPath);
    const entries = new Map();

    for (const result of dedupeRelated(relatedResults)) {
        const related = result.note;
        const folder = folderOf(related.relPath);

        if (!folder) {
            continue;
        }

        const strong = isStrongRelationship(result);
        const labels = reasonLabels(result);
        const key = String(related.relPath || related.name || "");

        for (const candidate of folderAncestors(folder)) {
            // The note's own folder and any folder above it are not useful
            // destinations.
            if (isSelfOrAncestor(candidate, ownFolder)) {
                continue;
            }

            if (!entries.has(candidate)) {
                entries.set(candidate, {
                    folder: candidate,
                    depth: candidate.split("/").length,
                    score: 0,
                    support: 0,
                    linked: false,
                    sources: [],
                    sourceKeys: new Set(),
                    signals: new Set(),
                });
            }

            const entry = entries.get(candidate);
            entry.score += result.score || 0;
            entry.support += 1;
            entry.linked = entry.linked || strong;

            for (const label of labels) {
                entry.signals.add(label);
            }

            if (key && !entry.sourceKeys.has(key)) {
                entry.sourceKeys.add(key);
                entry.sources.push(related.name);
            }
        }
    }

    const candidates = [...entries.values()].filter(
        (entry) => entry.support >= minSupport || entry.linked
    );

    candidates.sort(
        (a, b) =>
            b.score - a.score ||
            b.support - a.support ||
            b.depth - a.depth ||
            a.folder.localeCompare(b.folder)
    );

    return candidates.slice(0, limit).map((entry) => ({
        folder: entry.folder,
        score: entry.score,
        support: entry.support,
        linked: entry.linked,
        signals: [...entry.signals],
        sources: entry.sources
            .slice(0, maxSources)
            .sort((a, b) => a.localeCompare(b)),
    }));
}

module.exports = {
    MIN_FOLDER_SUPPORT,
    MAX_FOLDER_SUGGESTIONS,
    MAX_FOLDER_SOURCES,
    folderAncestors,
    suggestFolders,
};