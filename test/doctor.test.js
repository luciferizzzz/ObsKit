const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { analyzeVaultIndex, healthRating, computeHealthScore } = require("../checks/health");
const { buildVaultIndex } = require("../utils/vaultIndex");

function buildDir(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-doctor-"));
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return root;
}

function analyze(root) {
    const index = buildVaultIndex(root);
    return analyzeVaultIndex(index);
}

// ─── Healthy Vault ───────────────────────────────────────────────────

test("health: perfect score for fully linked, tagged notes", () => {
    const root = buildDir({
        "A.md": "#A\n#tag\ncontent [[B]]\n",
        "B.md": "#B\n#tag\ncontent [[A]] [[C]]\n",
        "C.md": "#C\n#tag\ncontent [[A]]\n",
    });
    const result = analyze(root);

    assert.equal(result.notesScanned, 3);
    assert.equal(result.score, 100);
    assert.equal(result.rating, "Excellent");
    assert.equal(
        result.brokenLinks + result.orphanNotes + result.emptyNotes +
            result.duplicates + result.missingTags + result.noOutgoing +
            result.malformedFrontmatter,
        0
    );
});

// ─── Issue Detection ─────────────────────────────────────────────────

test("health: detects broken links, orphans, empties, missing tags", () => {
    const root = buildDir({
        "A.md": "no links, no tags\n",
        "B.md": "no links, no tags\n",
        "C.md": "",
    });
    const result = analyze(root);

    assert.equal(result.brokenLinks, 0);
    assert.equal(result.orphanNotes, 3);
    assert.equal(result.emptyNotes, 1);
    assert.equal(result.missingTags, 3);
    assert.equal(result.noOutgoing, 3);
});

test("health: broken link is reported with source and target", () => {
    const root = buildDir({
        "Home.md": "[[Rust]]\n[[Ghost]]\n",
        "Rust.md": "[[home]]\n",
    });
    const result = analyze(root);

    assert.equal(result.brokenLinks, 1);
    assert.equal(result.details.brokenLinks.length, 1);
    assert.equal(result.details.brokenLinks[0].link, "Ghost");
});

// ─── Duplicates & Frontmatter ────────────────────────────────────────

test("health: same basename in different folders is a duplicate", () => {
    const root = buildDir({
        "a/Index.md": "#Index\n[[b/Index]]\n",
        "b/Index.md": "#Index\n[[a/Index]]\n",
    });
    const result = analyze(root);

    assert.equal(result.duplicates, 1);
    assert.deepEqual(result.duplicateNames, ["index"]);
});

test("health: malformed frontmatter detection", () => {
    const root = buildDir({
        "Bad.md": "---\ntitle: unclosed\nplain text\n",
        "Good.md": "#Good\ncontent\n",
    });
    const result = analyze(root);

    assert.equal(result.malformedFrontmatter, 1);
    assert.deepEqual(result.details.malformedFrontmatter, ["Bad.md"]);
});

// ─── Deterministic Score ─────────────────────────────────────────────

test("health: score is deterministic and rating follows score", () => {
    const root = buildDir({
        "A.md": "#A\ncontent\n",
        "B.md": "#B\ncontent [[A]]\n",
    });
    const first = analyze(root);
    const second = analyze(root);

    assert.equal(first.score, second.score);

    assert.equal(healthRating(0), "Needs Attention");
    assert.equal(healthRating(-1), "Needs Attention");
    assert.equal(healthRating(1), "Needs Attention");
    assert.equal(healthRating(25), "Needs Attention");
    assert.equal(healthRating(49), "Needs Attention");
    assert.equal(healthRating(50), "Fair");
    assert.equal(healthRating(69), "Fair");
    assert.equal(healthRating(74), "Fair");
    assert.equal(healthRating(75), "Good");
    assert.equal(healthRating(89), "Good");
    assert.equal(healthRating(90), "Excellent");
    assert.equal(healthRating(100), "Excellent");
    assert.equal(healthRating(120), "Excellent");
});

// ─── Command Registration ────────────────────────────────────────────

test("doctor: CLI command runs and prints health score", () => {
    const root = buildDir({
        "A.md": "#A\n#tag\ncontent [[B]]\n",
        "B.md": "#B\n#tag\ncontent [[A]]\n",
    });
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    const { spawnSync } = require("node:child_process");
    const bin = path.join(__dirname, "..", "bin", "obs.js");
    try {
        const { status, stdout } = spawnSync(process.execPath, [bin, "doctor"], {
            encoding: "utf8",
            cwd: path.join(__dirname, ".."),
        });
        assert.equal(status, 0);
        assert.ok(stdout.includes("Vault Doctor"));
        assert.ok(stdout.includes("Health Score"));
        assert.ok(stdout.includes("100/100"));
        assert.ok(stdout.includes("Excellent"));
    } finally {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    }
});

test("doctor: --json emits structured report", () => {
    const root = buildDir({
        "A.md": "",
    });
    const prev = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    const { spawnSync } = require("node:child_process");
    const bin = path.join(__dirname, "..", "bin", "obs.js");
    try {
        const { status, stdout } = spawnSync(process.execPath, [bin, "doctor", "--json"], {
            encoding: "utf8",
            cwd: path.join(__dirname, ".."),
        });
        assert.equal(status, 0);
        const parsed = JSON.parse(stdout);
        assert.equal(parsed.notesScanned, 1);
        assert.equal(parsed.issues.emptyNotes, 1);
        assert.equal(typeof parsed.score, "number");
        assert.equal(typeof parsed.rating, "string");
    } finally {
        if (prev === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = prev;
        }
    }
});

test("computeHealthScore: explicit formula components", () => {
    const score = computeHealthScore({
        brokenLinks: 0,
        orphanNotes: 0,
        emptyNotes: 0,
        duplicates: 0,
        missingTags: 0,
        noOutgoing: 0,
        malformedFrontmatter: 0,
    });
    assert.equal(score, 100);
});