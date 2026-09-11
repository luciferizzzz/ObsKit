const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { buildVaultIndex } = require("../utils/vaultIndex");
const { findRelatedNotes, WEIGHTS } = require("../checks/related");
const relatedCmd = require("../commands/related");

const bin = path.join(__dirname, "..", "bin", "obs.js");

function buildDir(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-related-"));
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return root;
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

// ─── Missing Target ──────────────────────────────────────────────────

test("related: unknown note returns no target", () => {
    const root = buildDir({ "A.md": "content\n" });
    const index = buildVaultIndex(root);

    const { target, results } = findRelatedNotes(index, "Ghost");
    assert.equal(target, null);
    assert.deepEqual(results, []);
});

// ─── Ranking Determinism ─────────────────────────────────────────────

test("related: backlink, tags, and shared links combine with weights", () => {
    const root = buildDir({
        "Alpha.md": "#Alpha\n#project\ncontent [[Beta]] [[Roadmap]]\n",
        "Beta.md": "#Beta\n#project\ncontent [[Alpha]]\n",
        "Gamma.md": "#Gamma\n#project\ncontent [[Alpha]] [[Roadmap]]\n",
        "Delta.md": "#Delta\n#tag-only\ncontent [[Beta]]\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Alpha", { limit: 10 });

    const ranked = results.map((r) => r.note.name);

    assert.ok(ranked.includes("Gamma"));
    assert.ok(ranked.includes("Beta"));
    assert.ok(ranked.includes("Delta"));

    const byName = {};
    for (const r of results) byName[r.note.name] = r;

    const gammaExpected = WEIGHTS.backlink + WEIGHTS.sharedTag + WEIGHTS.sharedLink;
    const gamma = byName["Gamma"];
    assert.equal(gamma.score, gammaExpected);
    assert.deepEqual(
        gamma.reasons.map((r) => r.type).sort(),
        ["backlink", "sharedLink", "sharedTag"]
    );

    const delta = byName["Delta"];
    assert.equal(delta.score, WEIGHTS.sharedLink);
});

// ─── Zero Result ─────────────────────────────────────────────────────

test("related: no overlap yields empty results", () => {
    const root = buildDir({
        "Alpha.md": "#Alpha\ncontent\n",
        "Unrelated.md": "#Unrelated\ncontent\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Alpha");
    assert.deepEqual(results, []);
});

// ─── Limit ───────────────────────────────────────────────────────────

test("related: limit caps the number of results", () => {
    const root = buildDir({
        "Alpha.md": "#Alpha\ncontent\n",
        "A1.md": "#A1\ncontent [[Alpha]]\n",
        "A2.md": "#A2\ncontent [[Alpha]]\n",
        "A3.md": "#A3\ncontent [[Alpha]]\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Alpha", { limit: 2 });
    assert.equal(results.length, 2);
});

// ─── Self Exclusion & Case Insensitivity ─────────────────────────────

test("related: excludes self and matches case-insensitively", () => {
    const root = buildDir({
        "Alpha.md": "#Alpha\ncontent [[BETA]]\n",
        "Beta.md": "#Beta\ncontent [[Alpha]]\n",
    });
    const index = buildVaultIndex(root);

    const { target, results } = findRelatedNotes(index, "alpha");
    assert.ok(target);
    assert.equal(target.name, "Alpha");
    assert.ok(!results.some((r) => r.note.name === "Alpha"));
    assert.ok(results.some((r) => r.note.name === "Beta"));
});

// ─── CLI ─────────────────────────────────────────────────────────────

test("related: CLI prints ranked related notes", () => {
    const root = buildDir({
        "Alpha.md": "#Alpha\n#project\ncontent [[Beta]]\n",
        "Beta.md": "#Beta\ncontent [[Alpha]]\n",
    });
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    try {
        const { status, stdout } = spawnSync(
            process.execPath,
            [bin, "related", "Alpha"],
            { encoding: "utf8", cwd: path.join(__dirname, "..") }
        );
        assert.equal(status, 0);
        assert.ok(stdout.includes("Related Notes"));
        assert.ok(stdout.includes("Beta"));
        assert.ok(stdout.includes("Links to this note"));
    } finally {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    }
});

test("related: CLI reports note not found", () => {
    const root = buildDir({ "A.md": "content\n" });
    const output = withVault(root, () =>
        capture(() => relatedCmd("Ghost"))
    );
    assert.ok(output.includes("Note not found: Ghost"));
});

function capture(fn) {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.map(String).join(" "));
    try {
        fn();
    } finally {
        console.log = original;
    }
    return logs.join("\n");
}