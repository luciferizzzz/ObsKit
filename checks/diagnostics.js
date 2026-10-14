const { normalizeNoteRef } = require("../utils/relationship/validator");
const { extractTags } = require("../utils/tags");
const {
    analyzeVaultIndex,
    findDuplicateFrontmatterKeys,
} = require("./health");

// Diagnostic severity model. `error` means the vault is provably broken,
// `warning` means references or structure are unreliable, `info` means the
// note is merely hard to discover. The health score is computed from the
// separate issue/warning counters in checks/health.js and never changes
// because of diagnostics.
const SEVERITY_RANK = {
    error: 0,
    warning: 1,
    info: 2,
};

const DIAGNOSTIC_DEFINITIONS = {
    METADATA_MALFORMED_FRONTMATTER: {
        severity: "error",
        title: "Malformed frontmatter",
        message: (count) =>
            count === 1
                ? "1 note left a frontmatter block unclosed."
                : `${count} notes left a frontmatter block unclosed.`,
        explanation:
            "A frontmatter block that never closes turns the rest of the note into unparseable metadata, so properties, tags, and templates cannot read it.",
        action: "Close the block with a matching --- line after the metadata.",
    },
    METADATA_DUPLICATE_KEY: {
        severity: "warning",
        title: "Duplicate frontmatter key",
        message: (count) =>
            count === 1
                ? "1 note repeats a frontmatter key."
                : `${count} notes repeat a frontmatter key.`,
        explanation:
            "Repeated keys inside one frontmatter block make the effective value depend on the parser.",
        action: "Remove the duplicated key so the metadata resolves predictably.",
    },
    RELATIONSHIP_BROKEN_LINK: {
        severity: "warning",
        title: "Broken relationship",
        message: (count) =>
            count === 1
                ? "1 wiki-link target cannot be resolved."
                : `${count} wiki-link targets cannot be resolved.`,
        explanation:
            "The reference points at a note that does not exist in this vault, so backlinks and navigation stop there.",
        action: "Check the wiki-link target or rename/move the reference.",
    },
    RELATIONSHIP_AMBIGUOUS_TARGET: {
        severity: "warning",
        title: "Ambiguous relationship target",
        message: (count) =>
            count === 1
                ? "1 wiki-link target matches several notes."
                : `${count} wiki-link targets match several notes.`,
        explanation:
            "Wiki-links resolve by basename, so a shared name makes it possible for the reference to land on the wrong note.",
        action: "Qualify the link with its folder path or rename one of the colliding notes.",
    },
    RELATIONSHIP_SELF_LINK: {
        severity: "info",
        title: "Self reference",
        message: (count) =>
            count === 1
                ? "1 self-referencing wiki-link found."
                : `${count} self-referencing wiki-links found.`,
        explanation:
            "A plain link back to the note that contains it adds no navigation. Heading anchors ([[Note#Section]]) are excluded because they are intentional.",
        action: "Remove the self-link or point it at the note you meant.",
    },
    NOTE_BASENAME_COLLISION: {
        severity: "warning",
        title: "Duplicate note identity",
        message: (count) =>
            count === 1
                ? "1 basename is shared by several notes."
                : `${count} basenames are shared by several notes.`,
        explanation:
            "Notes with the same name in different folders cannot be told apart by a bare [[Name]] reference.",
        action: "Rename one of the notes so references stay unambiguous.",
    },
    NOTE_ORPHAN: {
        severity: "info",
        title: "Orphan note",
        message: (count) =>
            count === 1
                ? "1 note has no incoming links."
                : `${count} notes have no incoming links.`,
        explanation:
            "Nothing links to this note, so readers following links and the graph view cannot reach it.",
        action: "Add a backlink from a related note.",
    },
    NOTE_ISOLATED: {
        severity: "warning",
        title: "Isolated note",
        message: (count) =>
            count === 1
                ? "1 note is not connected to the vault."
                : `${count} notes are not connected to the vault.`,
        explanation:
            "The note has no incoming links, no outgoing links, and no tags, so no existing signal can reach it.",
        action: "Connect it: link it from an existing note and give it a tag.",
    },
    TAG_SPELLING_VARIANT: {
        severity: "warning",
        title: "Tag spelling variant",
        message: (count) =>
            count === 1
                ? "1 tag is written in more than one way."
                : `${count} tags are written in more than one way.`,
        explanation:
            "Different spellings of the same tag split tag counts, searches, and tag-driven suggestions.",
        action: "Pick one spelling and update the notes that use the others.",
    },
    TAG_SINGLE_USE: {
        severity: "info",
        title: "Single-use tag",
        message: (count) =>
            count === 1
                ? "1 tag appears in only one note."
                : `${count} tags appear in only one note.`,
        explanation:
            "A tag used once adds no grouping power; it is usually a one-off or a typo of an existing tag.",
        action: "Reuse the tag on related notes or replace it with an existing one.",
    },
};

// Code-unit comparison, deliberately not localeCompare: diagnostic ordering
// must be byte-identical across machines with different ICU locales.
function compareStrings(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

// Stable identity for dedupe + sort. Items are either plain note paths or
// small objects, always produced by the same detector, so the key never
// collides across different findings.
function itemKey(item) {
    if (typeof item === "string") return item;
    if (item.file !== undefined) return `${item.file}\u0000${item.link || ""}\u0000${item.name || ""}`;
    if (item.name !== undefined) return item.name;
    if (item.variants !== undefined) return item.variants.join("\u0000");
    if (item.tag !== undefined) return `${item.tag}\u0000${item.note || ""}`;
    return JSON.stringify(item);
}

function compareItems(a, b) {
    return itemKey(a) < itemKey(b) ? -1 : itemKey(a) > itemKey(b) ? 1 : 0;
}

// A folder-qualified link ([[Folder/Note]]) already narrows the target down
// when exactly one colliding note lives under that path, so it is not
// reported as ambiguous even though the basename resolver ignores folders.
function folderHintResolves(raw, matches) {
    const hint = String(raw)
        .split("|")[0]
        .split("#")[0]
        .trim()
        .toLowerCase()
        .replace(/\.md$/, "");

    if (!hint.includes("/")) {
        return false;
    }

    let hits = 0;
    for (const match of matches) {
        const rel = String(match).toLowerCase().replace(/\.md$/, "");
        if (rel === hint || rel.endsWith(`/${hint}`)) hits++;
    }
    return hits === 1;
}

// Tag identity for variant detection: case folds and the -/_ separator
// difference collapse together, everything else stays distinct.
function tagVariantKey(raw) {
    return raw.slice(1).toLowerCase().replace(/-/g, "_");
}

function collectTagDiagnostics(index, add) {
    const variants = new Map();

    for (const note of index.notes) {
        for (const raw of extractTags(note.content)) {
            const key = tagVariantKey(raw);
            if (!variants.has(key)) {
                variants.set(key, { spellings: new Set(), notes: new Set() });
            }
            const entry = variants.get(key);
            entry.spellings.add(raw);
            entry.notes.add(note.relPath);
        }
    }

    for (const entry of variants.values()) {
        const spellings = [...entry.spellings].sort(compareStrings);
        const notes = [...entry.notes].sort(compareStrings);

        if (spellings.length > 1) {
            add("TAG_SPELLING_VARIANT", { variants: spellings, notes });
        } else if (notes.length === 1) {
            add("TAG_SINGLE_USE", { tag: spellings[0], note: notes[0] });
        }
    }
}

function collectDiagnostics(index, options = {}) {
    const health = options.health || analyzeVaultIndex(index);
    const findings = new Map();

    function add(code, item) {
        if (!findings.has(code)) {
            findings.set(code, new Map());
        }
        findings.get(code).set(itemKey(item), item);
    }

    const notesByBase = new Map();
    for (const note of index.notes) {
        const key = note.name.toLowerCase();
        if (!notesByBase.has(key)) notesByBase.set(key, []);
        notesByBase.get(key).push(note.relPath);
    }
    for (const files of notesByBase.values()) files.sort(compareStrings);

    for (const item of health.details.brokenLinks) {
        add("RELATIONSHIP_BROKEN_LINK", { file: item.file, link: item.link });
    }

    for (const note of index.notes) {
        for (const link of note.outgoingDetails) {
            const target = normalizeNoteRef(link.target);
            const matches = notesByBase.get(target);

            if (!matches) continue;

            if (matches.length > 1 && !folderHintResolves(link.raw, matches)) {
                add("RELATIONSHIP_AMBIGUOUS_TARGET", {
                    file: note.relPath,
                    link: link.raw,
                    matches,
                });
            }

            if (!link.heading) {
                const resolved = index.byName.get(target);
                if (resolved && resolved.relPath === note.relPath) {
                    add("RELATIONSHIP_SELF_LINK", { file: note.relPath, link: link.raw });
                }
            }
        }
    }

    for (const [name, files] of notesByBase) {
        if (files.length > 1) {
            add("NOTE_BASENAME_COLLISION", { name, files });
        }
    }

    for (const note of index.notes) {
        const connected =
            note.backlinks.length > 0 ||
            note.outgoing.length > 0 ||
            note.tags.length > 0;

        if (!connected) {
            add("NOTE_ISOLATED", note.relPath);
        } else if (note.backlinks.length === 0) {
            add("NOTE_ORPHAN", note.relPath);
        }
    }

    collectTagDiagnostics(index, add);

    for (const file of health.details.malformedFrontmatter) {
        add("METADATA_MALFORMED_FRONTMATTER", file);
    }

    for (const note of index.notes) {
        const keys = findDuplicateFrontmatterKeys(note.content);
        if (keys.length > 0) {
            add("METADATA_DUPLICATE_KEY", { file: note.relPath, keys });
        }
    }

    const diagnostics = [];

    for (const [code, items] of findings) {
        const definition = DIAGNOSTIC_DEFINITIONS[code];
        if (!definition) continue;

        const sortedItems = [...items.values()].sort(compareItems);
        const count = sortedItems.length;

        diagnostics.push({
            code,
            severity: definition.severity,
            title: definition.title,
            message: definition.message(count),
            explanation: definition.explanation,
            action: definition.action,
            count,
            items: sortedItems,
        });
    }

    diagnostics.sort(
        (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
            compareStrings(a.code, b.code)
    );

    return diagnostics;
}

function findDiagnostic(diagnostics, code) {
    return diagnostics.find((diagnostic) => diagnostic.code === code) || null;
}

module.exports = {
    SEVERITY_RANK,
    DIAGNOSTIC_DEFINITIONS,
    compareStrings,
    itemKey,
    collectDiagnostics,
    findDiagnostic,
};
