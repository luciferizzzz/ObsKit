const { countPendingTasks, analyzeVaultIndex, isEmptyNote } = require("./health");
const {
    collectDiagnostics,
    compareStrings,
    SEVERITY_RANK,
} = require("./diagnostics");
const { getSectionContent, parseHeadings } = require("../utils/relationship/parser");

const PERIODS = {
    today: 1,
    week: 7,
    month: 30,
};

function resolvePeriod(period, daysOption) {
    if (daysOption !== undefined && daysOption !== null && daysOption !== "") {
        const days = Math.max(1, parseInt(daysOption, 10) || 7);
        return {
            days,
            label: `Last ${days} days`,
        };
    }

    const key = String(period || "week").trim().toLowerCase();
    const days = PERIODS[key] || PERIODS.week;

    return {
        days,
        label: key === "today" ? "Today" : capitalize(key),
    };
}

function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function startDate(days) {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    return start;
}

function aggregateReview(index, options = {}) {
    const start = options.start || startDate(options.days || 7);
    const startMs = start.getTime();

    const created = [];
    const modified = [];
    const tagCount = {};
    let pendingTasks = 0;
    let relationships = 0;
    let brokenLinks = 0;
    const orphansCreated = [];

    for (const note of index.notes) {
        const modifiedInPeriod =
            new Date(note.mtime).getTime() >= startMs && note.mtime <= new Date();

        const createdInPeriod =
            new Date(note.created).getTime() >= startMs && note.created <= new Date();

        if (createdInPeriod) {
            created.push(note);
        }

        if (modifiedInPeriod) {
            modified.push(note);
        }

        const pending = countPendingTasks(note.content);
        pendingTasks += pending;

        const relatedSection = getSectionContent(note.content, "Related");
        if (relatedSection) {
            const relatedLinks = note.outgoingDetails.filter(
                (link) => relatedSection.includes(link.raw)
            );
            relationships += relatedLinks.length;
        }

        for (const target of note.outgoing) {
            if (!index.byName.has(target)) brokenLinks++;
        }

        if (createdInPeriod && !index.referenced.has(note.name.toLowerCase())) {
            orphansCreated.push(note);
        }

        for (const tag of note.tags) {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
        }
    }

    const activeTags = Object.entries(tagCount)
        .sort(
            (a, b) =>
                b[1] - a[1] ||
                a[0].localeCompare(b[0])
        )
        .slice(0, 10);

    const createdSorted = created
        .slice()
        .sort((a, b) => new Date(b.created) - new Date(a.created));
    const modifiedSorted = modified
        .slice()
        .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

    return {
        days: options.days || 7,
        start,
        created: createdSorted,
        modified: modifiedSorted,
        createdCount: createdSorted.length,
        modifiedCount: modifiedSorted.length,
        activeTags,
        pendingTasks,
        relationships,
        brokenLinks,
        orphansCreated,
        orphansCreatedCount: orphansCreated.length,
    };
}

// Workflow signals answer "what should I work on next", while diagnostics
// answer "what is wrong". They reuse the diagnostic findings for everything
// that is already detected and only add the locally computable readiness
// checks that doctor deliberately does not report.
const SIGNAL_DEFINITIONS = {
    FIX_MALFORMED_METADATA: {
        severity: "error",
        message: (count) =>
            count === 1
                ? "Close 1 unclosed frontmatter block."
                : `Close ${count} unclosed frontmatter blocks.`,
        action: "Add the missing --- line so the metadata can be parsed again.",
    },
    FIX_BROKEN_LINKS: {
        severity: "warning",
        message: (count) =>
            count === 1
                ? "Fix 1 broken wiki-link target."
                : `Fix ${count} broken wiki-link targets.`,
        action: "Correct the link target, or create the missing note.",
    },
    RESOLVE_NAME_COLLISIONS: {
        severity: "warning",
        message: (count) =>
            count === 1
                ? "Resolve 1 duplicated note name."
                : `Resolve ${count} duplicated note names.`,
        action: "Rename one note per collision so references resolve unambiguously.",
    },
    CONSOLIDATE_TAG_VARIANTS: {
        severity: "warning",
        message: (count) =>
            count === 1
                ? "Standardize 1 tag that is spelled in several ways."
                : `Standardize ${count} tags that are spelled in several ways.`,
        action: "Pick one spelling per tag and update the notes using the others.",
    },
    CONNECT_ISOLATED_NOTES: {
        severity: "warning",
        message: (count) =>
            count === 1
                ? "Connect 1 isolated note to the vault."
                : `Connect ${count} isolated notes to the vault.`,
        action: "Link them from an existing note and give them a tag.",
    },
    REVIEW_ORPHAN_NOTES: {
        severity: "info",
        message: (count) =>
            count === 1
                ? "Review 1 note that nothing links to."
                : `Review ${count} notes that nothing links to.`,
        action: "Add a backlink from a related note so it becomes reachable.",
    },
    ADD_STRUCTURE: {
        severity: "info",
        message: (count) =>
            count === 1
                ? "Add structure to 1 flat note."
                : `Add structure to ${count} flat notes.`,
        action: "Add a heading, a tag, or frontmatter so search and review can use it.",
    },
    CONNECT_LOW_DENSITY_NOTES: {
        severity: "info",
        message: (count) =>
            count === 1
                ? "Strengthen 1 note with very few connections."
                : `Strengthen ${count} notes with very few connections.`,
        action: "Add links to nearby notes so readers can move on from this note.",
    },
    FILE_UNFILED_NOTES: {
        severity: "info",
        message: (count) =>
            count === 1
                ? "File 1 untagged root note into a folder."
                : `File ${count} untagged root notes into folders.`,
        action: "Move them into a folder, or tag and link them from the root.",
    },
};

function hasFrontmatterBlock(content) {
    return /^---(?:\r?\n|$)/.test(content.replace(/^\uFEFF/, ""));
}

function findFlatNotes(index) {
    const notes = [];

    for (const note of index.notes) {
        const isolated =
            note.backlinks.length === 0 &&
            note.outgoing.length === 0 &&
            note.tags.length === 0;

        if (isolated || isEmptyNote(note.content)) continue;
        if (note.tags.length > 0) continue;
        if (parseHeadings(note.content).length > 0) continue;
        if (hasFrontmatterBlock(note.content)) continue;

        notes.push(note.relPath);
    }

    return notes.sort((a, b) => compareStrings(a, b));
}

function findLowDensityNotes(index) {
    const notes = [];

    for (const note of index.notes) {
        const connections = note.backlinks.length + note.outgoing.length;
        if (note.backlinks.length === 0) continue;
        if (connections > 2) continue;

        notes.push({ file: note.relPath, connections });
    }

    return notes.sort(
        (a, b) => a.connections - b.connections || compareStrings(a.file, b.file)
    );
}

function findUnfiledNotes(index) {
    const notes = [];

    for (const note of index.notes) {
        if (note.relPath.includes("/")) continue;
        if (note.tags.length > 0 || note.outgoing.length > 0) continue;

        // Fully disconnected notes are owned by CONNECT_ISOLATED_NOTES so
        // one note never shows up under two different actions.
        const isolated =
            note.backlinks.length === 0 &&
            note.outgoing.length === 0 &&
            note.tags.length === 0;
        if (isolated) continue;

        notes.push(note.relPath);
    }

    return notes.sort((a, b) => compareStrings(a, b));
}

function collectReviewSignals(index, options = {}) {
    const health = options.health || analyzeVaultIndex(index);
    const diagnostics = options.diagnostics || collectDiagnostics(index, { health });

    const byCode = new Map(diagnostics.map((diagnostic) => [diagnostic.code, diagnostic]));
    const itemsFor = (code) => {
        const diagnostic = byCode.get(code);
        return diagnostic ? diagnostic.items : [];
    };

    const candidates = [
        ["FIX_MALFORMED_METADATA", itemsFor("METADATA_MALFORMED_FRONTMATTER")],
        ["FIX_BROKEN_LINKS", itemsFor("RELATIONSHIP_BROKEN_LINK")],
        ["RESOLVE_NAME_COLLISIONS", itemsFor("NOTE_BASENAME_COLLISION")],
        ["CONSOLIDATE_TAG_VARIANTS", itemsFor("TAG_SPELLING_VARIANT")],
        ["CONNECT_ISOLATED_NOTES", itemsFor("NOTE_ISOLATED")],
        ["REVIEW_ORPHAN_NOTES", itemsFor("NOTE_ORPHAN")],
        ["ADD_STRUCTURE", findFlatNotes(index)],
        ["CONNECT_LOW_DENSITY_NOTES", findLowDensityNotes(index)],
        ["FILE_UNFILED_NOTES", findUnfiledNotes(index)],
    ];

    const signals = [];

    // Diagnostic items and the computed lists above are already sorted by
    // their collectors, so each signal keeps that order as-is.
    for (const [code, items] of candidates) {
        const definition = SIGNAL_DEFINITIONS[code];
        if (!definition || items.length === 0) continue;

        signals.push({
            code,
            severity: definition.severity,
            message: definition.message(items.length),
            action: definition.action,
            count: items.length,
            items,
        });
    }

    signals.sort(
        (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
            b.count - a.count ||
            compareStrings(a.code, b.code)
    );

    return signals;
}

module.exports = {
    PERIODS,
    resolvePeriod,
    startDate,
    aggregateReview,
    SIGNAL_DEFINITIONS,
    collectReviewSignals,
};