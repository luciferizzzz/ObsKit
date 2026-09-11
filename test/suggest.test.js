const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildVaultIndex } = require("../utils/vaultIndex");
const {
    buildSuggestions,
    jaccard,
    findDuplicateTitle,
    findSimilarNote,
} = require("../checks/suggest");

function buildDir(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-suggest-"));
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

test("suggest: unknown note returns note null", () => {
    const root = buildDir({ "A.md": "content\n" });
    const index = buildVaultIndex(root);

    const { note } = buildSuggestions(index, "Ghost");
    assert.equal(note, null);
});

// ─── Issue Types ─────────────────────────────────────────────────────

test("suggest: empty note triggers empty issue", () => {
    const root = buildDir({ "A.md": "" });
    const index = buildVaultIndex(root);

    const { note, issues } = buildSuggestions(index, "A");
    assert.ok(note);
    assert.ok(issues.some((s) => s.type === "empty"));
});

test("suggest: duplicate title and frontmatter issues", () => {
    const root = buildDir({
        "a/Alpha.md": "#Alpha\ncontent\n",
        "b/Alpha.md": "---\ntitle: x\nunclosed\n",
    });
    const index = buildVaultIndex(root);

    const alpha = index.byName.get("alpha");
    const { issues } = buildSuggestions(index, alpha.name);

    assert.ok(issues.some((s) => s.type === "duplicate"));
    assert.ok(issues.some((s) => s.type === "frontmatter"));
});

// ─── Opportunity Types ───────────────────────────────────────────────

test("suggest: untagged note with no links gets opportunities + link suggestions", () => {
    const root = buildDir({
        "Alpha.md": "plain content\n",
        "Alpha Plans.md": "plain content\n",
        "Gamma.md": "plain content\n",
    });
    const index = buildVaultIndex(root);

    const { opportunities } = buildSuggestions(index, "Alpha");

    assert.ok(opportunities.some((s) => s.type === "noTags"));
    assert.ok(opportunities.some((s) => s.type === "noOutgoing"));
    assert.ok(opportunities.some((s) => s.type === "noBacklinks"));

    const linkSuggestions = opportunities.filter((s) => s.type === "link");
    assert.ok(linkSuggestions.length > 0);
    assert.ok(linkSuggestions[0].message.includes("[[Alpha Plans]]"));
});

test("suggest: does not suggest linking already-linked notes", () => {
    const root = buildDir({
        "Alpha.md": "#Alpha\ncontent [[Beta]]\n",
        "Beta.md": "#Beta\ncontent\n",
        "Gamma.md": "#Gamma\ncontent\n",
    });
    const index = buildVaultIndex(root);

    const { opportunities } = buildSuggestions(index, "Alpha");

    const linkMessages = opportunities
        .filter((s) => s.type === "link")
        .map((s) => s.message);
    assert.ok(!linkMessages.some((m) => m.includes("[[Beta]]")));
});

// ─── Pending Tasks & Related Section ────────────────────────────────

test("suggest: pending tasks and Related section are respected", () => {
    const root = buildDir({
        "Alpha.md": "#Alpha\n- [ ] task one\n- [x] done\n",
        "Beta.md": "#Beta\ncontent\n",
    });
    const index = buildVaultIndex(root);

    const { opportunities } = buildSuggestions(index, "Alpha");

    assert.ok(
        opportunities.some((s) => s.type === "pendingTasks" && s.message.includes("1"))
    );
});

// ─── Jaccard & Title Similarity ──────────────────────────────────────

test("suggest: jaccard returns 1 for identical sets and 0 for disjoint", () => {
    assert.equal(jaccard(["a", "b"], ["a", "b"]), 1);
    assert.equal(jaccard(["a"], ["b"]), 0);
    assert.equal(jaccard([], []), 1);
    assert.equal(jaccard([], ["a"]), 0);
});

test("suggest: similar titles are detected above threshold", () => {
    const root = buildDir({
        "Budget Plan 2026.md": "# Budget Plan 2026\ncontent\n",
        "Budget Plan 2025.md": "# Budget Plan 2025\ncontent\n",
    });
    const index = buildVaultIndex(root);

    const duplicate = findDuplicateTitle(index, index.byName.get("budget plan 2026"));
    assert.equal(duplicate, null);

    const similar = findSimilarNote(index, index.byName.get("budget plan 2026"));
    assert.ok(similar);
    assert.equal(similar.name, "Budget Plan 2025");
});

// ─── Unicode / Emoji ─────────────────────────────────────────────────

test("suggest: handles unicode and emoji note names", () => {
    const root = buildDir({
        "日本語ノート.md": "# 日本語ノート\ncontent\n",
        "🚀 Launch.md": "# 🚀 Launch\ncontent\n",
    });
    const index = buildVaultIndex(root);

    const { note, opportunities } = buildSuggestions(index, "日本語ノート");
    assert.ok(note);
    assert.deepEqual(note.tags, []);
    assert.ok(opportunities.length >= 3);
});