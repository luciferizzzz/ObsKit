const path = require("path");

const { normalizeNoteRef } = require("../utils/relationship/validator");

const MAX_SCORE = 100;
const STALE_DAYS = 30;
const LARGE_NOTE_BYTES = 200 * 1024;

const ISSUE_PENALTIES = {
    brokenLinks: 2,
    orphanNotes: 3,
    emptyNotes: 5,
    duplicates: 4,
    missingTags: 2,
    noOutgoing: 1,
    malformedFrontmatter: 4,
};

const ISSUE_CAPS = {
    brokenLinks: 20,
    orphanNotes: 15,
    missingTags: 10,
    noOutgoing: 10,
};

const WARNING_PENALTIES = {
    staleNotes: 1,
    largeNotes: 1,
};

const WARNING_CAPS = {
    staleNotes: 10,
    largeNotes: 5,
};

function computeHealthScore(counts) {
    let deduction = 0;

    for (const key of Object.keys(ISSUE_PENALTIES)) {
        const count = counts[key] || 0;
        const cap = ISSUE_CAPS[key];
        const penalized = cap === undefined ? count : Math.min(count, cap);
        deduction += penalized * ISSUE_PENALTIES[key];
    }

    for (const key of Object.keys(WARNING_PENALTIES)) {
        const count = counts[key] || 0;
        const cap = WARNING_CAPS[key];
        const penalized = cap === undefined ? count : Math.min(count, cap);
        deduction += penalized * WARNING_PENALTIES[key];
    }

    return Math.max(0, MAX_SCORE - deduction);
}

function healthRating(score) {
    if (score >= 90) return "Excellent";
    if (score >= 75) return "Good";
    if (score >= 50) return "Fair";
    return "Needs Attention";
}

function isEmptyNote(content) {
    const meaningful = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(
            (line) => line && !line.startsWith("#") && !line.startsWith("<!--")
        );

    return meaningful.length === 0;
}

function hasMalformedFrontmatter(content) {
    const text = content.replace(/^\uFEFF/, "");

    if (!/^---(?:\r?\n|$)/.test(text)) {
        return false;
    }

    const rest = text.replace(/^---(?:\r?\n|$)/, "");
    return !/^---(?:\r?\n|$)/m.test(rest);
}

function countPendingTasks(content) {
    let count = 0;
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
        const match = line.match(/^\s*[-*]\s+\[\s\]\s+/);
        if (match) count++;
    }

    return count;
}

function dayDifference(mtime, now) {
    const diff = now.getTime() - new Date(mtime).getTime();
    return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function relPath(vault, file) {
    return path.relative(vault, file).split(path.sep).join("/");
}

function analyzeVaultIndex(index, options = {}) {
    const now = options.now || new Date();
    const staleDays = options.staleDays || STALE_DAYS;
    const largeBytes = options.largeBytes || LARGE_NOTE_BYTES;

    const counts = {
        brokenLinks: 0,
        orphanNotes: 0,
        emptyNotes: 0,
        duplicates: 0,
        missingTags: 0,
        noOutgoing: 0,
        malformedFrontmatter: 0,
        staleNotes: 0,
        largeNotes: 0,
    };

    const details = {
        brokenLinks: [],
        orphans: [],
        emptyNotes: [],
        missingTags: [],
        noOutgoing: [],
        duplicates: [],
        malformedFrontmatter: [],
        staleNotes: [],
        largeNotes: [],
    };

    const nameSeen = new Map();

    for (const note of index.notes) {
        const cleanName = note.name.toLowerCase();
        nameSeen.set(cleanName, (nameSeen.get(cleanName) || 0) + 1);

        for (const target of note.outgoing) {
            if (!index.byName.has(target)) {
                counts.brokenLinks++;
                const rawDetail = note.outgoingDetails.find(
                    (link) => normalizeNoteRef(link.target) === target
                );
                details.brokenLinks.push({
                    file: note.relPath,
                    link: rawDetail ? rawDetail.raw : target,
                });
            }
        }

        if (!index.referenced.has(cleanName)) {
            counts.orphanNotes++;
            details.orphans.push(note.relPath);
        }

        if (isEmptyNote(note.content)) {
            counts.emptyNotes++;
            details.emptyNotes.push(note.relPath);
        }

        if (hasMalformedFrontmatter(note.content)) {
            counts.malformedFrontmatter++;
            details.malformedFrontmatter.push(note.relPath);
        }

        if (note.tags.length === 0) {
            counts.missingTags++;
            details.missingTags.push(note.relPath);
        }

        if (note.outgoing.length === 0) {
            counts.noOutgoing++;
            details.noOutgoing.push(note.relPath);
        }

        const staleDaysDiff = dayDifference(note.mtime, now);
        if (staleDaysDiff >= staleDays) {
            counts.staleNotes++;
            details.staleNotes.push({
                file: note.relPath,
                days: staleDaysDiff,
            });
        }

        if (note.size > largeBytes) {
            counts.largeNotes++;
            details.largeNotes.push({
                file: note.relPath,
                size: note.size,
            });
        }
    }

    const duplicateNames = [];
    for (const [name, count] of nameSeen) {
        if (count > 1) {
            duplicateNames.push(name);
            counts.duplicates += count - 1;
        }
    }

    for (const note of index.notes) {
        if (duplicateNames.includes(note.name.toLowerCase())) {
            details.duplicates.push(note.relPath);
        }
    }

    const score = computeHealthScore(counts);

    return {
        notesScanned: index.notes.length,
        brokenLinks: counts.brokenLinks,
        orphanNotes: counts.orphanNotes,
        emptyNotes: counts.emptyNotes,
        duplicates: counts.duplicates,
        duplicateNames,
        missingTags: counts.missingTags,
        noOutgoing: counts.noOutgoing,
        malformedFrontmatter: counts.malformedFrontmatter,
        staleNotes: counts.staleNotes,
        largeNotes: counts.largeNotes,
        score,
        rating: healthRating(score),
        details,
    };
}

module.exports = {
    MAX_SCORE,
    STALE_DAYS,
    LARGE_NOTE_BYTES,
    ISSUE_PENALTIES,
    ISSUE_CAPS,
    WARNING_PENALTIES,
    WARNING_CAPS,
    computeHealthScore,
    healthRating,
    isEmptyNote,
    hasMalformedFrontmatter,
    countPendingTasks,
    analyzeVaultIndex,
};