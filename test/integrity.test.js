const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const { buildVaultIndex } = require("../utils/vaultIndex");
const {
    buildIntegrityReport,
    collectIntegrityDiagnostics,
    findDuplicateFrontmatterKeys,
    scanTagsWithLines,
    compareStrings,
} = require("../checks/integrity");

const bin = path.join(__dirname, "..", "bin", "obs.js");

function buildDir(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-integrity-"));
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return root;
}

function reportFor(root, options = {}) {
    const index = buildVaultIndex(root);
    return buildIntegrityReport(index, { integrityConfig: {}, ...options });
}

function codes(root, options = {}) {
    return reportFor(root, options).diagnostics.map((item) => item.code);
}

function byCode(root, code, options = {}) {
    return reportFor(root, options).diagnostics.filter((item) => item.code === code);
}

function withVault(root, fn) {
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    try {
        return fn();
    } finally {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    }
}

function runDoctor(root, args = []) {
    return withVault(root, () =>
        spawnSync(process.execPath, [bin, "doctor", ...args], {
            encoding: "utf8",
            cwd: path.join(__dirname, ".."),
        })
    );
}

// ─── Empty and healthy vaults ────────────────────────────────────────

test("integrity: empty vault reports nothing", () => {
    const root = buildDir({});
    const report = reportFor(root);
    assert.deepEqual(report.diagnostics, []);
    assert.equal(report.summary.total, 0);
    assert.equal(report.summary.affectedNotes, 0);
});

test("integrity: healthy, fully-linked vault reports nothing", () => {
    const root = buildDir({
        "A.md": "#one\nContent [[B]] and [[C]].\n",
        "B.md": "#one\nContent [[A]] and [[C]].\n",
        "C.md": "#one\nContent [[A]] and [[B]].\n",
    });
    assert.deepEqual(codes(root), []);
});

// ─── A. Broken wiki-links ────────────────────────────────────────────

test("integrity: broken wiki-link reports source path and exact line", () => {
    const root = buildDir({
        "Home.md": "line one\nline two\nSee [[Missing]] here.\n",
    });
    const items = byCode(root, "BROKEN_WIKI_LINK");
    assert.equal(items.length, 1);
    assert.equal(items[0].path, "Home.md");
    assert.equal(items[0].line, 3);
    assert.equal(items[0].target, "Missing");
    assert.equal(items[0].severity, "warning");
    assert.equal(items[0].category, "links");
});

test("integrity: valid link with alias is not flagged and broken alias keeps raw", () => {
    const root = buildDir({
        "A.md": "[[Target|Display Text]]\n[[Ghost|Display]]\n",
        "Target.md": "# Target\n",
    });
    const broken = byCode(root, "BROKEN_WIKI_LINK");
    assert.equal(broken.length, 1);
    assert.equal(broken[0].target, "Ghost|Display");
});

test("integrity: heading and block fragments resolve against the note", () => {
    const root = buildDir({
        "A.md": "[[Home#Setup]]\n[[Home#^block]]\n[[Ghost#Missing Heading]]\n",
        "Home.md": "# Home\n## Setup\n",
    });
    const broken = byCode(root, "BROKEN_WIKI_LINK");
    assert.equal(broken.length, 1);
    assert.equal(broken[0].target, "Ghost#Missing Heading");
    assert.equal(broken[0].line, 3);
});

test("integrity: unicode targets and nested folders resolve", () => {
    const root = buildDir({
        "Notes/A.md": "[[日本語ノート]]\n[[🚀 Launch]]\n[[Sub/Deep Note]]\n",
        "Notes/日本語ノート.md": "# JP\n",
        "Notes/🚀 Launch.md": "# Launch\n",
        "Other/Sub/Deep Note.md": "# Deep\n",
    });
    assert.deepEqual(codes(root), []);

    const brokenRoot = buildDir({
        "Notes/A.md": "[[🛰 Missing]]\n",
    });
    const broken = byCode(brokenRoot, "BROKEN_WIKI_LINK");
    assert.equal(broken[0].target, "🛰 Missing");
});

test("integrity: accepted casing differences are not broken", () => {
    const root = buildDir({
        "A.md": "[[camelcase]] [[UPPER]]\n",
        "CamelCase.md": "# c\n",
        "upper.md": "# u\n",
    });
    assert.deepEqual(codes(root), []);
});

// ─── B. Duplicate basenames and ambiguity ────────────────────────────

test("integrity: duplicate basenames are informational, one per note", () => {
    const root = buildDir({
        "a/API.md": "# API a\n",
        "b/API.md": "# API b\n",
    });
    const items = byCode(root, "DUPLICATE_BASENAME");
    assert.equal(items.length, 2);
    assert.ok(items.every((item) => item.severity === "info"));
    assert.deepEqual(
        items.map((item) => item.path).sort(compareStrings),
        ["a/API.md", "b/API.md"]
    );
    assert.equal(items[0].target, "api");
});

test("integrity: ambiguous reference reports source and line", () => {
    const root = buildDir({
        "a/API.md": "# a\n",
        "b/API.md": "# b\n",
        "Reader.md": "intro\nSee [[API]].\n",
    });
    const items = byCode(root, "AMBIGUOUS_REFERENCE");
    assert.equal(items.length, 1);
    assert.equal(items[0].path, "Reader.md");
    assert.equal(items[0].line, 2);
    assert.equal(items[0].target, "API");
    assert.equal(items[0].severity, "warning");
    assert.deepEqual(items[0].related, ["a/API.md", "b/API.md"]);
});

test("integrity: folder-qualified link resolves an ambiguous basename", () => {
    const root = buildDir({
        "a/API.md": "# a\n",
        "b/API.md": "# b\n",
        "Reader.md": "See [[a/API]].\n",
    });
    assert.equal(byCode(root, "AMBIGUOUS_REFERENCE").length, 0);
});

// ─── D. Missing files and attachments ────────────────────────────────

test("integrity: missing wiki attachment is reported with line", () => {
    const root = buildDir({
        "Note.md": "# Note\nEmbed ![[missing.png]] here.\n",
    });
    const items = byCode(root, "MISSING_ATTACHMENT");
    assert.equal(items.length, 1);
    assert.equal(items[0].line, 2);
    assert.equal(items[0].severity, "warning");
});

test("integrity: missing markdown attachment is reported", () => {
    const root = buildDir({
        "Note.md": "![alt](assets/missing.pdf)\n",
    });
    const items = byCode(root, "MISSING_ATTACHMENT");
    assert.equal(items.length, 1);
    assert.equal(items[0].line, 1);
});

test("integrity: existing attachments resolve (wiki, relative, URL-encoded)", () => {
    const root = buildDir({
        "Note.md": [
            "![[pic.png]]",
            "![](assets/diagram.png)",
            "![](assets/my%20file.png)",
        ].join("\n"),
        "assets/pic.png": "png",
        "assets/diagram.png": "png",
        "assets/my file.png": "png",
    });
    assert.equal(byCode(root, "MISSING_ATTACHMENT").length, 0);
});

test("integrity: external URLs are never flagged as missing files", () => {
    const root = buildDir({
        "Note.md": [
            "[site](https://example.com/image.png)",
            "[mail](mailto:me@example.com)",
            "[anchor](#section)",
            "[proto](//cdn.example.com/x.js)",
        ].join("\n"),
    });
    assert.equal(byCode(root, "MISSING_ATTACHMENT").length, 0);
});

test("integrity: dotted note names are not mistaken for missing files", () => {
    const root = buildDir({
        "Version 2.0.md": "# v\n",
        "Note.md": "[[Version 2.0]]\n",
    });
    assert.deepEqual(codes(root), []);
});

// ─── C. Tags ─────────────────────────────────────────────────────────

test("integrity: tag spelling variants are reported by location", () => {
    const root = buildDir({
        "A.md": "#Project notes\n",
        "B.md": "\n#project again\n",
    });
    const items = byCode(root, "TAG_SPELLING_VARIANT");
    assert.equal(items.length, 2);
    assert.deepEqual(
        items.map((item) => item.target).sort(compareStrings),
        ["#Project", "#project"]
    );
    assert.equal(items.find((item) => item.target === "#project").line, 2);
});

test("integrity: a tag used once is not flagged", () => {
    const root = buildDir({
        "A.md": "#solo only here\n",
    });
    assert.equal(byCode(root, "TAG_SPELLING_VARIANT").length, 0);
    assert.equal(byCode(root, "UNRECOGNIZED_TAG").length, 0);
});

test("integrity: unrecognized tag is reported only with a configured catalog", () => {
    const root = buildDir({
        "A.md": "#known and #stranger\n",
    });
    assert.equal(
        byCode(root, "UNRECOGNIZED_TAG", {
            integrityConfig: { tagCatalog: ["known"] },
        }).length,
        1
    );
    assert.equal(byCode(root, "UNRECOGNIZED_TAG").length, 0);
});

test("integrity: tags inside code blocks are ignored for line scanning", () => {
    const tags = scanTagsWithLines("```\n#notatag\n```\nreal #yes\n");
    assert.deepEqual(tags, [{ tag: "#yes", line: 4 }]);
});

// ─── E. Metadata ─────────────────────────────────────────────────────

test("integrity: duplicate frontmatter keys reported with line", () => {
    const root = buildDir({
        "A.md": "---\ntitle: one\nstatus: draft\ntitle: two\n---\nbody\n",
    });
    const items = byCode(root, "DUPLICATE_FRONTMATTER_KEY");
    assert.equal(items.length, 1);
    assert.equal(items[0].target, "title");
    assert.equal(items[0].line, 4);
    assert.deepEqual(findDuplicateFrontmatterKeys("---\na: 1\na: 2\n---\n"), [
        { key: "a", line: 3 },
    ]);
});

test("integrity: missing required field is reported only with an explicit rule", () => {
    const root = buildDir({
        "A.md": "---\ntitle: A\n---\nbody\n",
        "B.md": "no frontmatter\n",
    });
    const items = byCode(root, "MISSING_REQUIRED_FIELD", {
        integrityConfig: { requiredFrontmatter: ["status"] },
    });
    assert.equal(items.length, 2);
    assert.ok(items.every((item) => item.target === "status"));
    assert.equal(byCode(root, "MISSING_REQUIRED_FIELD").length, 0);
});

test("integrity: malformed frontmatter is an error", () => {
    const root = buildDir({
        "Bad.md": "---\ntitle: unclosed\nplain text\n",
    });
    const items = byCode(root, "MALFORMED_FRONTMATTER");
    assert.equal(items.length, 1);
    assert.equal(items[0].severity, "error");
    assert.equal(items[0].line, 1);
});

// ─── Multiple occurrences, dedup, ordering ───────────────────────────

test("integrity: multiple broken links on different lines stay separate", () => {
    const root = buildDir({
        "A.md": "[[One]]\ntext\n[[Two]]\ntext\n[[One]]\n",
    });
    const items = byCode(root, "BROKEN_WIKI_LINK");
    assert.equal(items.length, 3);
    assert.deepEqual(
        items.map((item) => item.line),
        [1, 3, 5]
    );
});

test("integrity: identical occurrences on the same line are deduplicated", () => {
    const root = buildDir({
        "A.md": "[[Dup]] and [[Dup]]\n",
    });
    assert.equal(byCode(root, "BROKEN_WIKI_LINK").length, 1);
});

test("integrity: ordering is deterministic across runs", () => {
    const root = buildDir({
        "b/API.md": "# b\n",
        "a/API.md": "# a\n",
        "Reader.md": "[[API]] [[Ghost]]\n",
    });
    const first = reportFor(root).diagnostics;
    const second = reportFor(root).diagnostics;
    assert.deepEqual(first, second);
});

test("integrity: summary counts are computed from diagnostics", () => {
    const root = buildDir({
        "A.md": "[[Ghost]]\n#tag\n",
        "B.md": "#Tag\n",
        "C.md": "![](missing.png)\n",
    });
    const summary = reportFor(root).summary;
    assert.equal(summary.errors, 0);
    assert.equal(summary.categories.links, 1);
    assert.equal(summary.categories.attachments, 1);
    assert.equal(summary.categories.tags, 2);
    assert.ok(summary.affectedNotes >= 2);
    assert.equal(summary.total, summary.errors + summary.warnings + summary.info);
});

// ─── Per-note filtering ──────────────────────────────────────────────

test("integrity: report can be filtered to one note", () => {
    const root = buildDir({
        "A.md": "[[Ghost]]\n",
        "B.md": "[[Phantom]]\n",
    });
    const filtered = reportFor(root, { note: "B.md" });
    assert.equal(filtered.filterMatched, true);
    assert.equal(filtered.diagnostics.length, 1);
    assert.equal(filtered.diagnostics[0].path, "B.md");

    const missing = reportFor(root, { note: "Nope.md" });
    assert.equal(missing.filterMatched, false);
    assert.deepEqual(missing.diagnostics, []);
});

// ─── CLI integration and JSON compatibility ──────────────────────────

test("integrity: doctor --json keeps legacy fields and adds integrity", () => {
    const root = buildDir({
        "A.md": "---\ntitle: one\n---\n[[Ghost]]\n",
    });
    const { status, stdout } = runDoctor(root, ["--json"]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);

    assert.equal(parsed.notesScanned, 1);
    assert.equal(typeof parsed.issues, "object");
    assert.equal(typeof parsed.warnings, "object");
    assert.ok(Array.isArray(parsed.duplicateNames));
    assert.equal(typeof parsed.score, "number");
    assert.equal(typeof parsed.rating, "string");

    assert.equal(typeof parsed.integrity, "object");
    assert.equal(typeof parsed.integrity.summary.total, "number");
    assert.ok(Array.isArray(parsed.integrity.diagnostics));
    const broken = parsed.integrity.diagnostics.find(
        (item) => item.code === "BROKEN_WIKI_LINK"
    );
    assert.equal(broken.path, "A.md");
    assert.equal(broken.line, 4);
});

test("integrity: doctor text output shows the integrity section", () => {
    const root = buildDir({
        "A.md": "[[Ghost]]\n",
    });
    const { status, stdout } = runDoctor(root);
    assert.equal(status, 0);
    assert.ok(stdout.includes("Vault Integrity"));
    assert.ok(stdout.includes("Broken wiki-links"));
});

test("integrity: doctor --verbose prints issue locations", () => {
    const root = buildDir({
        "A.md": "[[Ghost]]\n",
    });
    const { status, stdout } = runDoctor(root, ["--verbose"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("[WARNING] BROKEN_WIKI_LINK"));
    assert.ok(stdout.includes("File: A.md"));
    assert.ok(stdout.includes("Line: 1"));
    assert.ok(stdout.includes("Action:"));
});

test("integrity: doctor --note filters the JSON integrity report", () => {
    const root = buildDir({
        "A.md": "[[Ghost]]\n",
        "B.md": "[[Phantom]]\n",
    });
    const { status, stdout } = runDoctor(root, ["--json", "--note", "B.md"]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.integrity.filter.note, "B.md");
    assert.equal(parsed.integrity.filter.matched, true);
    assert.equal(parsed.integrity.diagnostics.length, 1);
    assert.equal(parsed.integrity.diagnostics[0].path, "B.md");
});

// ─── Filesystem immutability ─────────────────────────────────────────

function snapshot(root) {
    const entries = {};
    function walk(dir) {
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                walk(full);
            } else {
                const rel = path.relative(root, full).split(path.sep).join("/");
                const bytes = fs.readFileSync(full);
                entries[rel] = {
                    hash: crypto.createHash("sha256").update(bytes).digest("hex"),
                    mtimeMs: stat.mtimeMs,
                };
            }
        }
    }
    walk(root);
    return entries;
}

test("integrity: report generation does not mutate the vault", () => {
    const root = buildDir({
        "A.md": "---\na: 1\na: 2\n---\n[[Ghost]] #tag\n",
        "B.md": "#Tag\n![](missing.png)\n",
        "assets/keep.png": "binary",
    });

    const before = snapshot(root);
    reportFor(root);
    runDoctor(root, ["--verbose", "--json"]);
    const after = snapshot(root);

    assert.deepEqual(after, before);
});
