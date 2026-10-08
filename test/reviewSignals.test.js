const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { buildVaultIndex } = require("../utils/vaultIndex");
const { collectReviewSignals } = require("../checks/review");
const { SEVERITY_RANK } = require("../checks/diagnostics");

const bin = path.join(__dirname, "..", "bin", "obs.js");

function buildDir(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-signals-"));
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return root;
}

function signalsFor(root) {
    return collectReviewSignals(buildVaultIndex(root));
}

function codes(signals) {
    return signals.map((signal) => signal.code);
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

test("signals: healthy linked vault has no next actions", () => {
    const root = buildDir({
        "A.md": "#tag\ncontent [[B]] [[C]]\n",
        "B.md": "#tag\ncontent [[A]] [[C]]\n",
        "C.md": "#tag\ncontent [[A]] [[B]]\n",
    });

    assert.deepEqual(signalsFor(root), []);
});

test("signals: empty vault has no next actions", () => {
    assert.deepEqual(signalsFor(buildDir({})), []);
});

// ─── Actionable items ────────────────────────────────────────────────

test("signals: mixed vault lists every actionable code in ranked order", () => {
    const root = buildDir({
        "Home.md": "[[Ghost]]\n",
        "Project/API.md": "#API\n[[Home]]\n",
        "Archive/API.md": "#API\n",
        "Lonely.md": "",
        "Flat.md": "plain text [[Home]]\n",
    });

    const signals = signalsFor(root);
    assert.deepEqual(codes(signals), [
        "CONNECT_ISOLATED_NOTES",
        "FIX_BROKEN_LINKS",
        "RESOLVE_NAME_COLLISIONS",
        "REVIEW_ORPHAN_NOTES",
        "ADD_STRUCTURE",
    ]);

    const broken = signals.find((signal) => signal.code === "FIX_BROKEN_LINKS");
    assert.equal(broken.severity, "warning");
    assert.deepEqual(broken.items, [{ file: "Home.md", link: "Ghost" }]);
    assert.ok(broken.action.length > 0);

    const orphans = signals.find((signal) => signal.code === "REVIEW_ORPHAN_NOTES");
    assert.deepEqual(orphans.items, [
        "Archive/API.md",
        "Flat.md",
        "Project/API.md",
    ]);

    const isolated = signals.find((signal) => signal.code === "CONNECT_ISOLATED_NOTES");
    assert.deepEqual(isolated.items, ["Lonely.md"]);
});

test("signals: ranked by severity, then count, then code", () => {
    const root = buildDir({
        "Open.md": "---\ntitle: unclosed\nplain\n",
        "Home.md": "[[Ghost]] [[Missing]]\n",
        "Tagged.md": "#Work\n",
        "Other.md": "#work\n",
    });

    const signals = signalsFor(root);
    const ranks = signals.map((signal) => SEVERITY_RANK[signal.severity]);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
    assert.equal(signals[0].code, "FIX_MALFORMED_METADATA");
    assert.equal(signals[0].severity, "error");

    for (let i = 1; i < signals.length; i++) {
        const previous = signals[i - 1];
        const current = signals[i];
        if (previous.severity !== current.severity) continue;
        if (previous.count === current.count) {
            assert.ok(previous.code < current.code);
        } else {
            assert.ok(previous.count > current.count);
        }
    }
});

test("signals: malformed frontmatter becomes the top error action", () => {
    const root = buildDir({
        "Open.md": "---\ntitle: unclosed\nplain\n",
    });

    const signals = signalsFor(root);
    assert.equal(signals[0].code, "FIX_MALFORMED_METADATA");
    assert.equal(signals[0].severity, "error");
    assert.deepEqual(signals[0].items, ["Open.md"]);
});

// ─── Structure & density signals ─────────────────────────────────────

test("signals: flat notes without tags, headings, or frontmatter are listed", () => {
    const root = buildDir({
        "Folder/Flat.md": "just a paragraph [[Hub]]\n",
        "Hub.md": "#tag\n[[Flat]]\n",
        "Heading.md": "# Title\ntext [[Hub]]\n",
        "Meta.md": "---\ntitle: x\n---\ntext [[Hub]]\n",
        "Blank.md": "",
    });

    const signal = signalsFor(root).find((entry) => entry.code === "ADD_STRUCTURE");
    assert.ok(signal);
    assert.deepEqual(signal.items, ["Folder/Flat.md"]);
});

test("signals: low-density notes are ranked by connection count", () => {
    const root = buildDir({
        "Hub.md": "#tag\n[[Leaf]] [[Sink]] [[Other]]\n",
        "Leaf.md": "#tag\n[[Hub]]\n",
        "Sink.md": "#tag\njust text\n",
        "Other.md": "#tag\n[[Hub]] [[Leaf]]\n",
    });

    const signal = signalsFor(root).find((entry) => entry.code === "CONNECT_LOW_DENSITY_NOTES");
    assert.ok(signal);
    assert.deepEqual(signal.items, [{ file: "Sink.md", connections: 1 }]);
    assert.equal(signal.severity, "info");
});

test("signals: untagged root notes with a backlink are unfiled", () => {
    const root = buildDir({
        "Root.md": "loose note\n",
        "Hub.md": "#tag\n[[Root]]\n",
    });

    const signal = signalsFor(root).find((entry) => entry.code === "FILE_UNFILED_NOTES");
    assert.ok(signal);
    assert.deepEqual(signal.items, ["Root.md"]);

    // The isolated root note is owned by the isolated signal, not this one.
    const isolatedRoot = buildDir({ "Root.md": "loose note\n" });
    assert.ok(!codes(signalsFor(isolatedRoot)).includes("FILE_UNFILED_NOTES"));
});

// ─── Diagnostic reuse ────────────────────────────────────────────────

test("signals: tag spelling variants become a consolidation action", () => {
    const root = buildDir({
        "A.md": "#Work\n",
        "B.md": "#work\n",
    });

    const signal = signalsFor(root).find((entry) => entry.code === "CONSOLIDATE_TAG_VARIANTS");
    assert.ok(signal);
    assert.equal(signal.severity, "warning");
    assert.deepEqual(signal.items[0].variants, ["#Work", "#work"]);
});

// ─── Determinism ─────────────────────────────────────────────────────

test("signals: repeated runs produce identical output", () => {
    const root = buildDir({
        "Open.md": "---\ntitle: unclosed\nplain\n",
        "Home.md": "[[Ghost]] #Work\n",
        "Tagged.md": "#work\n",
        "Project/API.md": "#API\n",
        "Archive/API.md": "#API\n",
        "Flat.md": "plain text [[Home]]\n",
    });

    const first = signalsFor(root);
    const second = signalsFor(root);
    assert.deepEqual(first, second);
    assert.ok(first.length > 0);
});

test("signals: every signal carries code, severity, message, and action", () => {
    const root = buildDir({
        "Home.md": "[[Ghost]]\n",
        "Flat.md": "plain text [[Home]]\n",
        "Lonely.md": "",
    });

    for (const signal of signalsFor(root)) {
        assert.match(signal.code, /^[A-Z][A-Z_]+$/);
        assert.ok(["error", "warning", "info"].includes(signal.severity));
        assert.ok(signal.message.length > 0);
        assert.ok(signal.action.length > 0);
        assert.equal(signal.count, signal.items.length);
        assert.ok(signal.count > 0);
    }
});

// ─── CLI ─────────────────────────────────────────────────────────────

test("review: CLI renders Next Actions with items", () => {
    const root = buildDir({
        "Home.md": "[[Ghost]]\n",
    });

    withVault(root, () => {
        const { status, stdout } = spawnSync(process.execPath, [bin, "review"], {
            encoding: "utf8",
            cwd: path.join(__dirname, ".."),
        });
        assert.equal(status, 0);
        assert.ok(stdout.includes("Next Actions"));
        assert.ok(stdout.includes("Fix 1 broken wiki-link target."));
        assert.ok(stdout.includes("Home.md"));
        assert.ok(stdout.includes("Overview"));
        assert.ok(stdout.includes("Recently Modified"));
    });
});

test("review: CLI prints None for a healthy vault", () => {
    const root = buildDir({
        "A.md": "#tag\ncontent [[B]] [[C]]\n",
        "B.md": "#tag\ncontent [[A]] [[C]]\n",
        "C.md": "#tag\ncontent [[A]] [[B]]\n",
    });

    withVault(root, () => {
        const { status, stdout } = spawnSync(process.execPath, [bin, "review"], {
            encoding: "utf8",
            cwd: path.join(__dirname, ".."),
        });
        assert.equal(status, 0);
        assert.ok(stdout.includes("Next Actions"));
        assert.ok(stdout.includes("None."));
    });
});
