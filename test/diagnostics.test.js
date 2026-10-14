const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { buildVaultIndex } = require("../utils/vaultIndex");
const { analyzeVaultIndex, findDuplicateFrontmatterKeys } = require("../checks/health");
const { collectDiagnostics, findDiagnostic, SEVERITY_RANK } = require("../checks/diagnostics");

const bin = path.join(__dirname, "..", "bin", "obs.js");

function buildDir(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-diagnostics-"));
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return root;
}

function diagnosticsFor(root) {
    return collectDiagnostics(buildVaultIndex(root));
}

function codeList(diagnostics) {
    return diagnostics.map((diagnostic) => diagnostic.code);
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

// ─── Healthy / empty vault ───────────────────────────────────────────

test("diagnostics: healthy vault reports nothing", () => {
    const root = buildDir({
        "A.md": "#tag\ncontent [[B]] [[C]]\n",
        "B.md": "#tag\ncontent [[A]] [[C]]\n",
        "C.md": "#tag\ncontent [[A]] [[B]]\n",
    });

    assert.deepEqual(diagnosticsFor(root), []);
});

test("diagnostics: empty vault reports nothing", () => {
    assert.deepEqual(diagnosticsFor(buildDir({})), []);
});

// ─── Broken / unresolved relationships ───────────────────────────────

test("diagnostics: broken wiki-link is a warning with source and target", () => {
    const root = buildDir({
        "Home.md": "[[Ghost]]\n",
    });

    const diagnostic = findDiagnostic(diagnosticsFor(root), "RELATIONSHIP_BROKEN_LINK");
    assert.ok(diagnostic);
    assert.equal(diagnostic.severity, "warning");
    assert.equal(diagnostic.count, 1);
    assert.deepEqual(diagnostic.items, [{ file: "Home.md", link: "Ghost" }]);
    assert.ok(diagnostic.message.includes("1 wiki-link target"));
    assert.ok(diagnostic.action.length > 0);
    assert.ok(diagnostic.explanation.length > 0);
});

test("diagnostics: broken nested link resolves relative to its note", () => {
    const root = buildDir({
        "Folder/Home.md": "[[Missing]]\n",
    });

    const diagnostic = findDiagnostic(diagnosticsFor(root), "RELATIONSHIP_BROKEN_LINK");
    assert.equal(diagnostic.count, 1);
    assert.equal(diagnostic.items[0].file, "Folder/Home.md");
});

// ─── Basename collisions & ambiguity ─────────────────────────────────

test("diagnostics: basename collision lists every colliding file", () => {
    const root = buildDir({
        "Project/API.md": "#API\n",
        "Archive/API.md": "#API old\n",
    });

    const diagnostic = findDiagnostic(diagnosticsFor(root), "NOTE_BASENAME_COLLISION");
    assert.ok(diagnostic);
    assert.equal(diagnostic.severity, "warning");
    assert.equal(diagnostic.count, 1);
    assert.deepEqual(diagnostic.items[0], {
        name: "api",
        files: ["Archive/API.md", "Project/API.md"],
    });
});

test("diagnostics: bare link to a colliding basename is ambiguous", () => {
    const root = buildDir({
        "Home.md": "[[API]]\n",
        "Project/API.md": "#API\n",
        "Archive/API.md": "#API old\n",
    });

    const diagnostic = findDiagnostic(diagnosticsFor(root), "RELATIONSHIP_AMBIGUOUS_TARGET");
    assert.ok(diagnostic);
    assert.equal(diagnostic.severity, "warning");
    assert.equal(diagnostic.count, 1);
    assert.deepEqual(diagnostic.items[0], {
        file: "Home.md",
        link: "API",
        matches: ["Archive/API.md", "Project/API.md"],
    });
});

test("diagnostics: folder-qualified link to a collision is not ambiguous", () => {
    const root = buildDir({
        "Home.md": "[[Project/API]]\n",
        "Project/API.md": "#API\n",
        "Archive/API.md": "#API old\n",
    });

    const codes = codeList(diagnosticsFor(root));
    assert.ok(!codes.includes("RELATIONSHIP_AMBIGUOUS_TARGET"));
    assert.ok(codes.includes("NOTE_BASENAME_COLLISION"));
});

// ─── Self references ─────────────────────────────────────────────────

test("diagnostics: plain self-link is flagged, heading anchor is not", () => {
    const root = buildDir({
        "Solo.md": "#Solo\n[[Solo]]\n[[Solo#Section]]\n[[Other]]\n",
        "Other.md": "#Other\n#tag\n[[Solo]]\n",
    });

    const diagnostic = findDiagnostic(diagnosticsFor(root), "RELATIONSHIP_SELF_LINK");
    assert.ok(diagnostic);
    assert.equal(diagnostic.severity, "info");
    assert.equal(diagnostic.count, 1);
    assert.deepEqual(diagnostic.items, [{ file: "Solo.md", link: "Solo" }]);
});

test("diagnostics: cross-note links never count as self references", () => {
    const root = buildDir({
        "A.md": "#A\n#tag\n[[B]]\n",
        "B.md": "#B\n#tag\n[[A]]\n",
    });

    const codes = codeList(diagnosticsFor(root));
    assert.ok(!codes.includes("RELATIONSHIP_SELF_LINK"));
    assert.ok(!codes.includes("NOTE_ORPHAN"));
    assert.ok(!codes.includes("NOTE_ISOLATED"));
});

// ─── Orphan / isolated partition ─────────────────────────────────────

test("diagnostics: orphan keeps outgoing links, isolated has none", () => {
    const root = buildDir({
        "Hub.md": "#Hub\n#tag\n[[Target]]\n",
        "Target.md": "#Target\n#tag\n",
        "Lonely.md": "",
        "Plain.md": "no links, no tags, but has text\n",
    });

    const diagnostics = diagnosticsFor(root);
    const orphan = findDiagnostic(diagnostics, "NOTE_ORPHAN");
    const isolated = findDiagnostic(diagnostics, "NOTE_ISOLATED");

    assert.ok(orphan);
    assert.equal(orphan.severity, "info");
    assert.deepEqual(orphan.items, ["Hub.md"]);

    assert.ok(isolated);
    assert.equal(isolated.severity, "warning");
    assert.deepEqual(isolated.items.sort(), ["Lonely.md", "Plain.md"]);
});

test("diagnostics: a note with tags but no links is orphan, not isolated", () => {
    const root = buildDir({
        "Tagged.md": "#Tagged\n#only\nsome text\n",
    });

    const diagnostics = diagnosticsFor(root);
    assert.ok(findDiagnostic(diagnostics, "NOTE_ORPHAN"));
    assert.ok(!findDiagnostic(diagnostics, "NOTE_ISOLATED"));
});

// ─── Tag diagnostics ─────────────────────────────────────────────────

test("diagnostics: case variants of one tag are reported", () => {
    const root = buildDir({
        "A.md": "#Work\n",
        "B.md": "#work\n",
    });

    const diagnostic = findDiagnostic(diagnosticsFor(root), "TAG_SPELLING_VARIANT");
    assert.ok(diagnostic);
    assert.equal(diagnostic.severity, "warning");
    assert.equal(diagnostic.count, 1);
    assert.deepEqual(diagnostic.items[0], {
        variants: ["#Work", "#work"],
        notes: ["A.md", "B.md"],
    });
});

test("diagnostics: dash/underscore variants of one tag are reported", () => {
    const root = buildDir({
        "A.md": "#tag-one\n",
        "B.md": "#tag_one\n",
    });

    const diagnostic = findDiagnostic(diagnosticsFor(root), "TAG_SPELLING_VARIANT");
    assert.ok(diagnostic);
    assert.deepEqual(diagnostic.items[0].variants, ["#tag-one", "#tag_one"]);
});

test("diagnostics: single-use tag is informational", () => {
    const root = buildDir({
        "A.md": "#shared\n#lonely\n",
        "B.md": "#shared\n",
    });

    const diagnostic = findDiagnostic(diagnosticsFor(root), "TAG_SINGLE_USE");
    assert.ok(diagnostic);
    assert.equal(diagnostic.severity, "info");
    assert.equal(diagnostic.count, 1);
    assert.deepEqual(diagnostic.items, [{ tag: "#lonely", note: "A.md" }]);
});

test("diagnostics: tags inside code blocks are ignored", () => {
    const root = buildDir({
        "A.md": "#tag\n```\n#codeonly\n```\n",
        "B.md": "#tag\n",
    });

    const serialized = JSON.stringify(diagnosticsFor(root));
    assert.ok(!serialized.includes("codeonly"));
});

// ─── Metadata diagnostics ────────────────────────────────────────────

test("diagnostics: malformed frontmatter is the only error severity", () => {
    const root = buildDir({
        "Bad.md": "---\ntitle: unclosed\nplain text\n",
        "Good.md": "#Good\n#tag\ncontent [[Bad]]\n",
    });

    const diagnostics = diagnosticsFor(root);
    const diagnostic = findDiagnostic(diagnostics, "METADATA_MALFORMED_FRONTMATTER");
    assert.ok(diagnostic);
    assert.equal(diagnostic.severity, "error");
    assert.deepEqual(diagnostic.items, ["Bad.md"]);

    const severities = diagnostics.map((entry) => SEVERITY_RANK[entry.severity]);
    assert.deepEqual(severities, [...severities].sort((a, b) => a - b));
    assert.equal(severities[0], 0);
});

test("diagnostics: duplicate frontmatter keys are reported", () => {
    const root = buildDir({
        "Dup.md": "---\ntitle: one\ntitle: two\ntags: [a]\n---\nbody\n",
        "Fine.md": "---\ntitle: one\ntags: [a]\n---\nbody\n",
    });

    const diagnostic = findDiagnostic(diagnosticsFor(root), "METADATA_DUPLICATE_KEY");
    assert.ok(diagnostic);
    assert.equal(diagnostic.severity, "warning");
    assert.deepEqual(diagnostic.items, [{ file: "Dup.md", keys: ["title"] }]);
});

test("findDuplicateFrontmatterKeys: indented list values are not keys", () => {
    const content = "---\ntitle: x\ntags:\n  - a\n  - b\n---\nbody\n";
    assert.deepEqual(findDuplicateFrontmatterKeys(content), []);

    const duplicated = "---\ntags:\n  - a\ntags:\n  - b\n---\nbody\n";
    assert.deepEqual(findDuplicateFrontmatterKeys(duplicated), ["tags"]);

    assert.deepEqual(findDuplicateFrontmatterKeys("no frontmatter\n"), []);
    assert.deepEqual(findDuplicateFrontmatterKeys("---\nunclosed\n"), []);
});

// ─── Severity model & deterministic ordering ─────────────────────────

test("diagnostics: mixed vault is ordered by severity then code", () => {
    const root = buildDir({
        "Open.md": "---\ntitle: unclosed\nplain text\n",
        "Home.md": "[[Ghost]] #Work\n",
        "Project/API.md": "#API\n",
        "Archive/API.md": "#API old\n",
        "Tagged.md": "#work\n",
        "Flat.md": "text only\n",
    });

    const diagnostics = diagnosticsFor(root);
    const codes = codeList(diagnostics);

    assert.ok(codes.includes("METADATA_MALFORMED_FRONTMATTER"));
    assert.ok(codes.includes("RELATIONSHIP_BROKEN_LINK"));
    assert.ok(codes.includes("NOTE_BASENAME_COLLISION"));
    assert.ok(codes.includes("TAG_SPELLING_VARIANT"));
    assert.ok(codes.includes("NOTE_ISOLATED"));

    const ranks = diagnostics.map((entry) => SEVERITY_RANK[entry.severity]);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));

    for (let i = 1; i < diagnostics.length; i++) {
        const previous = diagnostics[i - 1];
        const current = diagnostics[i];
        if (previous.severity === current.severity) {
            assert.ok(previous.code < current.code, `${previous.code} < ${current.code}`);
        }
    }

    assert.deepEqual(diagnosticsFor(root), diagnostics);
});

test("diagnostics: every diagnostic carries code, severity, message, action", () => {
    const root = buildDir({
        "Home.md": "[[Ghost]] #Work\n",
        "Tagged.md": "#work\n",
    });

    for (const diagnostic of diagnosticsFor(root)) {
        assert.match(diagnostic.code, /^[A-Z][A-Z_]+$/);
        assert.ok(["error", "warning", "info"].includes(diagnostic.severity));
        assert.ok(diagnostic.title.length > 0);
        assert.ok(diagnostic.message.length > 0);
        assert.ok(diagnostic.explanation.length > 0);
        assert.ok(diagnostic.action.length > 0);
        assert.equal(diagnostic.count, diagnostic.items.length);
        assert.ok(diagnostic.count > 0);
    }
});

// ─── Reuse of health data ────────────────────────────────────────────

test("diagnostics: accepts a precomputed health result", () => {
    const root = buildDir({
        "Home.md": "[[Ghost]]\n",
    });

    const index = buildVaultIndex(root);
    const health = analyzeVaultIndex(index);
    const first = collectDiagnostics(index, { health });
    const second = collectDiagnostics(index);

    assert.deepEqual(first, second);
});

// ─── CLI ─────────────────────────────────────────────────────────────

test("doctor: prints a Diagnostics section", () => {
    const root = buildDir({
        "A.md": "#A\n#tag\ncontent [[B]]\n",
        "B.md": "#B\n#tag\ncontent [[A]]\n",
    });

    withVault(root, () => {
        const { status, stdout } = spawnSync(process.execPath, [bin, "doctor"], {
            encoding: "utf8",
            cwd: path.join(__dirname, ".."),
        });
        assert.equal(status, 0);
        assert.ok(stdout.includes("Diagnostics"));
        assert.ok(stdout.includes("Health Score"));
    });
});

test("doctor: --json includes diagnostics without items", () => {
    const root = buildDir({
        "Home.md": "[[Ghost]]\n",
    });

    withVault(root, () => {
        const { status, stdout } = spawnSync(process.execPath, [bin, "doctor", "--json"], {
            encoding: "utf8",
            cwd: path.join(__dirname, ".."),
        });
        assert.equal(status, 0);

        const parsed = JSON.parse(stdout);
        assert.ok(Array.isArray(parsed.diagnostics));

        const broken = parsed.diagnostics.find(
            (entry) => entry.code === "RELATIONSHIP_BROKEN_LINK"
        );
        assert.ok(broken);
        assert.equal(broken.severity, "warning");
        assert.equal(broken.count, 1);
        assert.ok(broken.action.length > 0);
        assert.equal(broken.items, undefined);
    });
});

test("doctor: --json --verbose includes diagnostic items", () => {
    const root = buildDir({
        "Home.md": "[[Ghost]]\n",
    });

    withVault(root, () => {
        const { status, stdout } = spawnSync(
            process.execPath,
            [bin, "doctor", "--json", "--verbose"],
            { encoding: "utf8", cwd: path.join(__dirname, "..") }
        );
        assert.equal(status, 0);

        const parsed = JSON.parse(stdout);
        const broken = parsed.diagnostics.find(
            (entry) => entry.code === "RELATIONSHIP_BROKEN_LINK"
        );
        assert.deepEqual(broken.items, [{ file: "Home.md", link: "Ghost" }]);
        assert.ok(parsed.details);
    });
});

test("doctor: CLI output is deterministic across runs", () => {
    const root = buildDir({
        "Open.md": "---\ntitle: unclosed\nplain\n",
        "Home.md": "[[Ghost]] #Work\n",
        "Tagged.md": "#work\n",
        "Project/API.md": "#API\n",
        "Archive/API.md": "#API old\n",
    });

    const first = withVault(root, () =>
        spawnSync(process.execPath, [bin, "doctor", "--json", "--verbose"], {
            encoding: "utf8",
            cwd: path.join(__dirname, ".."),
        })
    );
    const second = withVault(root, () =>
        spawnSync(process.execPath, [bin, "doctor", "--json", "--verbose"], {
            encoding: "utf8",
            cwd: path.join(__dirname, ".."),
        })
    );

    assert.equal(first.status, 0);
    assert.equal(second.status, 0);
    assert.deepEqual(JSON.parse(first.stdout), JSON.parse(second.stdout));
});
