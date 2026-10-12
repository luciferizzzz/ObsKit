const path = require("path");

const { normalizeNoteRef } = require("../utils/relationship/validator");
const {
    buildLineStarts,
    lineAtOffset,
} = require("../utils/relationship/parser");
const { hasMalformedFrontmatter } = require("./health");
const { scanAttachments } = require("./attachments");
const { getConfig } = require("../utils/config");

// Severity meanings: an `error` is provably broken, a `warning` makes
// navigation or structure unreliable, `info` is merely hard to disambiguate.
// The health score in checks/health.js is independent and never changes here.
const SEVERITY_RANK = {
    error: 0,
    warning: 1,
    info: 2,
};

const CATEGORY_BY_CODE = {
    BROKEN_WIKI_LINK: "links",
    AMBIGUOUS_REFERENCE: "references",
    DUPLICATE_BASENAME: "basenames",
    MISSING_ATTACHMENT: "attachments",
    MALFORMED_FRONTMATTER: "metadata",
    DUPLICATE_FRONTMATTER_KEY: "metadata",
    MISSING_REQUIRED_FIELD: "metadata",
    TAG_SPELLING_VARIANT: "tags",
    UNRECOGNIZED_TAG: "tags",
};

const CATEGORIES = [
    "links",
    "references",
    "basenames",
    "attachments",
    "metadata",
    "tags",
];

const DIAGNOSTIC_DEFINITIONS = {
    BROKEN_WIKI_LINK: {
        severity: "warning",
        category: "links",
        title: "Broken wiki-link",
        explanation:
            "The wiki-link points at a note that does not exist in this vault, so navigation and backlinks stop there.",
        action:
            "Check the target name, rename or move the referenced note, or update the wiki-link.",
    },
    AMBIGUOUS_REFERENCE: {
        severity: "warning",
        category: "references",
        title: "Ambiguous reference",
        explanation:
            "Wiki-links resolve by basename, so a shared name makes it possible for this reference to land on the wrong note.",
        action:
            "Qualify the link with its folder path or rename one of the colliding notes.",
    },
    DUPLICATE_BASENAME: {
        severity: "info",
        category: "basenames",
        title: "Duplicate note basename",
        explanation:
            "Notes with the same name in different folders cannot be told apart by a bare [[Name]] reference.",
        action: "Rename one of the notes so references stay unambiguous.",
    },
    MISSING_ATTACHMENT: {
        severity: "warning",
        category: "attachments",
        title: "Missing attachment",
        explanation:
            "The note references a local file or attachment that cannot be found in the vault.",
        action:
            "Check the path, move the file into the vault, or remove the reference.",
    },
    MALFORMED_FRONTMATTER: {
        severity: "error",
        category: "metadata",
        title: "Malformed frontmatter",
        explanation:
            "A frontmatter block that never closes turns the rest of the note into unparseable metadata, so properties and tags cannot be read.",
        action: "Close the block with a matching --- line after the metadata.",
    },
    DUPLICATE_FRONTMATTER_KEY: {
        severity: "warning",
        category: "metadata",
        title: "Duplicate frontmatter key",
        explanation:
            "Repeated keys inside one frontmatter block make the effective value depend on the parser.",
        action:
            "Remove the duplicated key so the metadata resolves predictably.",
    },
    MISSING_REQUIRED_FIELD: {
        severity: "warning",
        category: "metadata",
        title: "Missing required field",
        explanation:
            "A frontmatter field required by configuration is absent from this note.",
        action:
            "Add the field to the note frontmatter or update the required-field rule.",
    },
    TAG_SPELLING_VARIANT: {
        severity: "warning",
        category: "tags",
        title: "Tag spelling variant",
        explanation:
            "Different spellings of the same tag split tag counts, searches, and tag-driven suggestions.",
        action: "Pick one spelling and update the notes that use the others.",
    },
    UNRECOGNIZED_TAG: {
        severity: "warning",
        category: "tags",
        title: "Unrecognized tag",
        explanation:
            "The tag is not part of the configured tag catalog.",
        action:
            "Use a catalog tag, add the tag to the catalog, or remove the tag.",
    },
};

// Code-unit comparison, deliberately not localeCompare: diagnostics must sort
// byte-identically across machines with different ICU locales.
function compareStrings(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

function safeDecode(value) {
    try {
        return decodeURIComponent(value);
    } catch (err) {
        return value;
    }
}

// ─── Frontmatter ─────────────────────────────────────────────────────

function splitFrontmatter(content) {
    const text = content.replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/);

    if (lines.length === 0 || !/^---\s*$/.test(lines[0])) {
        return { present: false, malformed: false, keys: [], endLine: null };
    }

    let end = -1;
    for (let i = 1; i < lines.length; i++) {
        if (/^---\s*$/.test(lines[i])) {
            end = i;
            break;
        }
    }

    if (end === -1) {
        return { present: true, malformed: true, keys: [], endLine: null };
    }

    const keys = [];
    for (let i = 1; i < end; i++) {
        const match = /^([A-Za-z0-9_.-]+)\s*:/.exec(lines[i]);
        if (match) {
            keys.push({ key: match[1].toLowerCase(), line: i + 1 });
        }
    }

    return { present: true, malformed: false, keys, endLine: end + 1 };
}

function frontmatterKeySet(frontmatter) {
    const keys = new Set();
    for (const entry of frontmatter.keys) {
        keys.add(entry.key);
    }
    return keys;
}

function findDuplicateFrontmatterKeys(content) {
    const frontmatter = splitFrontmatter(content);
    if (!frontmatter.present || frontmatter.malformed) {
        return [];
    }

    const seen = new Set();
    const duplicates = [];

    for (const entry of frontmatter.keys) {
        if (seen.has(entry.key)) {
            duplicates.push({ key: entry.key, line: entry.line });
        } else {
            seen.add(entry.key);
        }
    }

    return duplicates;
}

// ─── Tags ────────────────────────────────────────────────────────────

function tagVariantKey(value) {
    return String(value)
        .replace(/^#/, "")
        .toLowerCase()
        .replace(/-/g, "_");
}

// Line-accurate tag scan that mirrors utils/tags.extractTags (fenced and
// inline code ignored) while keeping the source line for each tag.
function scanTagsWithLines(content) {
    const lines = content.split(/\r?\n/);
    const tags = [];
    let inFence = false;
    let fenceChar = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fence = /^\s*(`{3,}|~{3,})/.exec(line);

        if (fence) {
            if (!inFence) {
                inFence = true;
                fenceChar = fence[1][0];
            } else if (fence[1][0] === fenceChar) {
                inFence = false;
                fenceChar = null;
            }
            continue;
        }

        if (inFence) {
            continue;
        }

        const cleaned = line.replace(/`[^`]*`/g, "");
        const regex = /(?:^|\s)#([a-zA-Z0-9_/][a-zA-Z0-9_\-/]*)/g;
        let match;

        while ((match = regex.exec(cleaned)) !== null) {
            tags.push({ tag: "#" + match[1], line: i + 1 });
        }
    }

    return tags;
}

// ─── File / attachment references ────────────────────────────────────

const WIKI_REF_RE = /\[\[([^\]]+)\]\]/g;
const MARKDOWN_REF_RE = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
const EXTERNAL_REF_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

// Only explicit attachment/file extensions are checked. This keeps note names
// that merely contain a dot (e.g. [[Version 2.0]]) from being mistaken for
// missing files, at the cost of not checking unusual source-code references.
const ATTACHMENT_EXTENSIONS = new Set([
    "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "tif", "tiff",
    "avif", "heic", "pdf", "mp3", "mp4", "mov", "wav", "ogg", "flac", "m4a",
    "webm", "avi", "mkv", "zip", "7z", "rar", "tar", "gz", "csv", "xls",
    "xlsx", "ods", "doc", "docx", "ppt", "pptx", "txt", "canvas", "excalidraw",
]);

function fileExtension(target) {
    const ext = path.posix.extname(path.posix.basename(target)).toLowerCase();
    return ext.startsWith(".") ? ext.slice(1) : "";
}

function scanFileReferences(content, lineStarts) {
    const refs = [];
    let match;

    WIKI_REF_RE.lastIndex = 0;
    while ((match = WIKI_REF_RE.exec(content)) !== null) {
        let rest = match[1].trim();
        if (!rest) continue;
        if (rest.includes("|")) rest = rest.split("|")[0];
        if (rest.includes("#")) rest = rest.split("#")[0];
        rest = rest.trim();
        if (!ATTACHMENT_EXTENSIONS.has(fileExtension(rest))) continue;
        refs.push({ kind: "wiki", ref: rest, raw: match[0], offset: match.index });
    }

    MARKDOWN_REF_RE.lastIndex = 0;
    while ((match = MARKDOWN_REF_RE.exec(content)) !== null) {
        let url = match[3].trim();
        url = url.replace(/\s+("[^"]*"|'[^']*')\s*$/, "").trim();
        if (url.startsWith("<") && url.endsWith(">")) {
            url = url.slice(1, -1).trim();
        }
        if (!url) continue;
        const decoded = safeDecode(url);
        const clean = decoded.split("#")[0].split("?")[0];
        if (!ATTACHMENT_EXTENSIONS.has(fileExtension(clean))) continue;
        refs.push({ kind: "markdown", ref: url, raw: match[0], offset: match.index });
    }

    for (const ref of refs) {
        ref.line = lineAtOffset(lineStarts, ref.offset);
        ref.column = ref.offset - lineStarts[ref.line - 1];
    }

    return refs;
}

function buildFileIndex(vault, index) {
    const relSet = new Set();
    const baseSet = new Set();

    if (vault) {
        let attachments = [];
        try {
            attachments = scanAttachments(vault);
        } catch (err) {
            attachments = [];
        }
        for (const attachment of attachments) {
            relSet.add(attachment.relPath.toLowerCase());
            baseSet.add(path.posix.basename(attachment.relPath).toLowerCase());
        }
    }

    for (const note of index.notes) {
        relSet.add(note.relPath.toLowerCase());
        baseSet.add(note.name.toLowerCase());
    }

    return { relSet, baseSet };
}

function resolvesLocalRef(ref, noteRelPath, fileIndex) {
    const decoded = safeDecode(String(ref).trim()).replace(/\\/g, "/");
    const withoutFragment = decoded.split("#")[0].split("?")[0].trim();

    if (!withoutFragment) return true;
    if (EXTERNAL_REF_RE.test(withoutFragment)) return true;

    const cleaned = withoutFragment.replace(/^\.\//, "").replace(/^\/+/, "");
    if (!cleaned) return true;

    const lower = cleaned.toLowerCase();
    if (fileIndex.relSet.has(lower)) return true;

    const dir = path.posix.dirname(noteRelPath);
    if (dir && dir !== "." && fileIndex.relSet.has(`${dir.toLowerCase()}/${lower}`)) {
        return true;
    }

    return fileIndex.baseSet.has(path.posix.basename(lower));
}

// ─── Config-driven rules ─────────────────────────────────────────────

function getIntegrityConfig() {
    let config = null;
    try {
        config = getConfig();
    } catch (err) {
        config = null;
    }
    if (!config || typeof config !== "object") return {};
    const integrity = config.integrity;
    return integrity && typeof integrity === "object" ? integrity : {};
}

function normalizeFieldList(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
        const key = String(item).trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(key);
    }
    return out.sort(compareStrings);
}

function normalizeTagCatalog(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    const set = new Set();
    for (const item of list) {
        const key = tagVariantKey(item);
        if (key) set.add(key);
    }
    return set.size > 0 ? set : null;
}

// ─── Diagnostics ─────────────────────────────────────────────────────

function notesByBasename(index) {
    const map = new Map();
    for (const note of index.notes) {
        const key = note.name.toLowerCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(note.relPath);
    }
    for (const files of map.values()) {
        files.sort(compareStrings);
    }
    return map;
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

    if (!hint.includes("/")) return false;

    let hits = 0;
    for (const match of matches) {
        const rel = String(match).toLowerCase().replace(/\.md$/, "");
        if (rel === hint || rel.endsWith(`/${hint}`)) hits++;
    }

    return hits === 1;
}

function collectIntegrityDiagnostics(index, options = {}) {
    const integrityConfig = options.integrityConfig || getIntegrityConfig();
    const vault = options.vault || index.vault;
    const requiredFields = normalizeFieldList(integrityConfig.requiredFrontmatter);
    const tagCatalog = normalizeTagCatalog(integrityConfig.tagCatalog);

    const byBase = notesByBasename(index);
    const occurrences = [];
    const seen = new Set();
    const fileRefs = [];
    const tagSpellings = new Map();

    function add(code, data) {
        const definition = DIAGNOSTIC_DEFINITIONS[code];
        if (!definition) return;

        // Identity is code + location + target. Column is intentionally not
        // part of the key, so two identical findings on one line collapse,
        // while the same target on different lines stays as two occurrences.
        const key = [
            code,
            data.path || "",
            data.line === undefined || data.line === null ? "" : data.line,
            data.target || "",
        ].join("\u0000");

        if (seen.has(key)) return;
        seen.add(key);

        occurrences.push({
            code,
            severity: definition.severity,
            category: definition.category,
            title: definition.title,
            path: data.path || null,
            line: data.line === undefined ? null : data.line,
            target: data.target === undefined ? null : data.target,
            message: data.message,
            explanation: definition.explanation,
            action: definition.action,
            related: data.related,
        });
    }

    for (const note of index.notes) {
        const lineStarts = buildLineStarts(note.content);

        for (const link of note.outgoingDetails) {
            const target = normalizeNoteRef(link.target);
            const matches = byBase.get(target);

            if (!matches) {
                add("BROKEN_WIKI_LINK", {
                    path: note.relPath,
                    line: link.line === undefined ? null : link.line,
                    column: link.offset === undefined ? null : link.offset,
                    target: link.raw,
                    message: `[[${link.raw}]] does not resolve to any note in the vault.`,
                });
                continue;
            }

            if (matches.length > 1 && !folderHintResolves(link.raw, matches)) {
                add("AMBIGUOUS_REFERENCE", {
                    path: note.relPath,
                    line: link.line === undefined ? null : link.line,
                    column: link.offset === undefined ? null : link.offset,
                    target: link.raw,
                    related: matches,
                    message: `[[${link.raw}]] matches ${matches.length} notes: ${matches.join(", ")}.`,
                });
            }
        }

        const tags = scanTagsWithLines(note.content);
        for (const tag of tags) {
            if (tagCatalog && !tagCatalog.has(tagVariantKey(tag.tag))) {
                add("UNRECOGNIZED_TAG", {
                    path: note.relPath,
                    line: tag.line,
                    column: 0,
                    target: tag.tag,
                    message: `${tag.tag} is not part of the configured tag catalog.`,
                });
            }

            const normalized = tagVariantKey(tag.tag);
            if (!tagSpellings.has(normalized)) {
                tagSpellings.set(normalized, new Map());
            }
            const spellings = tagSpellings.get(normalized);
            if (!spellings.has(tag.tag)) {
                spellings.set(tag.tag, []);
            }
            spellings.get(tag.tag).push({ path: note.relPath, line: tag.line });
        }

        if (hasMalformedFrontmatter(note.content)) {
            add("MALFORMED_FRONTMATTER", {
                path: note.relPath,
                line: 1,
                column: 0,
                target: null,
                message: "Frontmatter block is never closed with a matching --- line.",
            });
        }

        for (const duplicate of findDuplicateFrontmatterKeys(note.content)) {
            add("DUPLICATE_FRONTMATTER_KEY", {
                path: note.relPath,
                line: duplicate.line,
                column: 0,
                target: duplicate.key,
                message: `Frontmatter key "${duplicate.key}" is declared more than once.`,
            });
        }

        if (requiredFields.length > 0) {
            const frontmatter = splitFrontmatter(note.content);
            if (!(frontmatter.present && frontmatter.malformed)) {
                const keys = frontmatterKeySet(frontmatter);
                for (const field of requiredFields) {
                    if (keys.has(field)) continue;
                    add("MISSING_REQUIRED_FIELD", {
                        path: note.relPath,
                        line: null,
                        column: null,
                        target: field,
                        message: `Required frontmatter field "${field}" is missing.`,
                    });
                }
            }
        }

        for (const ref of scanFileReferences(note.content, lineStarts)) {
            fileRefs.push({ note, ref });
        }
    }

    for (const [base, files] of byBase) {
        if (files.length < 2) continue;
        for (const relPath of files) {
            add("DUPLICATE_BASENAME", {
                path: relPath,
                line: null,
                column: null,
                target: base,
                related: files,
                message: `Basename "${base}" is shared by ${files.length} notes: ${files.join(", ")}.`,
            });
        }
    }

    for (const spellings of tagSpellings.values()) {
        const variants = [...spellings.keys()].sort(compareStrings);
        if (variants.length < 2) continue;
        for (const variant of variants) {
            const first = spellings.get(variant)[0];
            const others = variants.filter((item) => item !== variant);
            add("TAG_SPELLING_VARIANT", {
                path: first.path,
                line: first.line,
                column: 0,
                target: variant,
                related: variants,
                message: `Tag ${variant} is also written as ${others.join(", ")}.`,
            });
        }
    }

    if (fileRefs.length > 0) {
        const fileIndex = buildFileIndex(vault, index);
        for (const { note, ref } of fileRefs) {
            if (resolvesLocalRef(ref.ref, note.relPath, fileIndex)) continue;
            add("MISSING_ATTACHMENT", {
                path: note.relPath,
                line: ref.line,
                column: ref.column,
                target: ref.ref,
                message: `Local reference ${ref.raw} cannot be resolved in the vault.`,
            });
        }
    }

    return occurrences;
}

function compareOccurrences(a, b) {
    const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severity !== 0) return severity;

    const code = compareStrings(a.code, b.code);
    if (code !== 0) return code;

    const filePath = compareStrings(a.path || "", b.path || "");
    if (filePath !== 0) return filePath;

    const lineA = a.line === null ? Infinity : a.line;
    const lineB = b.line === null ? Infinity : b.line;
    if (lineA !== lineB) return lineA - lineB;

    return compareStrings(a.target || "", b.target || "");
}

function summarize(occurrences) {
    const severity = { error: 0, warning: 0, info: 0 };
    const categories = {};
    for (const category of CATEGORIES) {
        categories[category] = 0;
    }

    const notes = new Set();

    for (const occurrence of occurrences) {
        if (severity[occurrence.severity] !== undefined) {
            severity[occurrence.severity]++;
        }
        const category = CATEGORY_BY_CODE[occurrence.code];
        if (category) categories[category]++;
        if (occurrence.path) notes.add(occurrence.path.toLowerCase());
    }

    return {
        total: occurrences.length,
        errors: severity.error,
        warnings: severity.warning,
        info: severity.info,
        affectedNotes: notes.size,
        categories,
    };
}

function resolveNoteFilter(index, filter) {
    const clean = String(filter).trim().replace(/\\/g, "/").toLowerCase();
    if (!clean) return null;

    const withMd = clean.endsWith(".md") ? clean : `${clean}.md`;

    for (const note of index.notes) {
        const rel = note.relPath.toLowerCase();
        if (rel === clean || rel === withMd) return note.relPath;
    }

    const base = normalizeNoteRef(clean);
    for (const note of index.notes) {
        if (normalizeNoteRef(note.name) === base) return note.relPath;
    }

    return null;
}

function buildIntegrityReport(index, options = {}) {
    let diagnostics = collectIntegrityDiagnostics(index, options);
    let filterMatched = true;

    if (options.note) {
        const relPath = resolveNoteFilter(index, options.note);
        filterMatched = Boolean(relPath);
        diagnostics = relPath
            ? diagnostics.filter(
                  (item) => item.path && item.path.toLowerCase() === relPath.toLowerCase()
              )
            : [];
    }

    diagnostics.sort(compareOccurrences);

    return {
        summary: summarize(diagnostics),
        diagnostics,
        filter: options.note || null,
        filterMatched,
    };
}

module.exports = {
    SEVERITY_RANK,
    CATEGORY_BY_CODE,
    CATEGORIES,
    DIAGNOSTIC_DEFINITIONS,
    compareStrings,
    compareOccurrences,
    getIntegrityConfig,
    splitFrontmatter,
    findDuplicateFrontmatterKeys,
    scanTagsWithLines,
    scanFileReferences,
    resolvesLocalRef,
    buildIntegrityReport,
    collectIntegrityDiagnostics,
    summarize,
    resolveNoteFilter,
};
