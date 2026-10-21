// Tests for the optional `limit` option added to the approved search
// functions in Phase 2 (Search Foundation v2).
//
// Contract:
//   - Omitting `limit` preserves the existing unlimited behavior.
//   - A positive integer number caps the returned results.
//   - The limit is applied AFTER the function's established ordering is
//     determined (readdir traversal order for searchFiles, score order for
//     fuzzySearchFiles, match-count order for searchByContent) and never by
//     re-sorting anything.
//   - Invalid values (0, negatives, non-integers, numeric strings, NaN,
//     non-number types) are rejected with a clear error instead of being
//     silently coerced.
//
// Conventions follow test/search.test.js: node:test + node:assert/strict and
// isolated `mkdtempSync` vaults.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    searchFiles,
    fuzzySearchFiles,
    searchByContent,
} = require("../utils/search");

// Independent depth-first readdir oracle: mirrors the traversal contract
// directly from fs, so a sort introduced anywhere in searchFiles shows up as
// a mismatch.
function traversalOrder(root) {
    const out = [];
    (function walk(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else out.push(full);
        }
    })(root);
    return out;
}

function makeLimitVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-search-limit-"));
    // Mixed-case names: readdir order differs from a default lexicographic
    // sort on this platform, so ordering assertions are discriminating.
    fs.writeFileSync(path.join(root, "Rust Zulu.md"), "# zulu\n");
    fs.writeFileSync(path.join(root, "rust apple.md"), "# apple\n");
    fs.writeFileSync(path.join(root, "Rust Banana.md"), "# banana\n");
    fs.mkdirSync(path.join(root, "Notes"), { recursive: true });
    fs.writeFileSync(path.join(root, "Notes", "rust nested.md"), "# nested\n");
    fs.writeFileSync(path.join(root, "Cargo.md"), "# cargo\n");
    return root;
}

function makeContentVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-content-limit-"));
    fs.writeFileSync(path.join(root, "Alpha.md"), "cargo 1\ncargo 2\ncargo 3\n");
    fs.writeFileSync(path.join(root, "Beta.md"), "nothing here\n");
    fs.writeFileSync(path.join(root, "Gamma.md"), "cargo a\ncargo b\n");
    fs.writeFileSync(path.join(root, "Delta.md"), "cargo solo\n");
    return root;
}

// Every one of these must be rejected with the shared clear error. `undefined`
// (the omitted case) is deliberately NOT in this list.
const INVALID_LIMITS = [
    0,
    -1,
    -10,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    "2",
    "",
    "1.5",
    "abc",
    null,
    true,
    false,
    {},
    [1],
];

function assertRejects(fn) {
    assert.throws(fn, /Invalid limit: must be a positive integer/);
}

// ─── shared invalid-limit coverage ────────────────────────────────────

test("invalid limits are rejected by every approved search function", () => {
    const root = makeLimitVault();
    for (const value of INVALID_LIMITS) {
        assertRejects(() => searchFiles(root, "rust", { limit: value }));
        assertRejects(() => fuzzySearchFiles(root, "rust", { limit: value }));
        assertRejects(() => searchByContent(root, "cargo", { limit: value }));
    }
});

test("searchFiles: invalid limit is rejected even when nothing matches", () => {
    const root = makeLimitVault();
    assertRejects(() => searchFiles(root, "zzz", { limit: 0 }));
});

test("searchFiles: invalid limit is rejected even for an empty query", () => {
    const root = makeLimitVault();
    assertRejects(() => searchFiles(root, "   ", { limit: -1 }));
});

// ─── searchFiles ──────────────────────────────────────────────────────

test("searchFiles: omitted limit stays unlimited", () => {
    const root = makeLimitVault();
    const { query, results } = searchFiles(root, "rust");
    assert.equal(query, "rust");
    assert.equal(results.length, 4);
});

test("searchFiles: limit keeps the first results in traversal order", () => {
    const root = makeLimitVault();
    const full = searchFiles(root, "rust").results;
    const limited = searchFiles(root, "rust", { limit: 2 }).results;

    assert.equal(limited.length, 2);
    assert.deepEqual(limited, full.slice(0, 2));

    // The kept results are the first matches in readdir traversal order —
    // not a sorted selection.
    const expectedNames = traversalOrder(root)
        .map((file) => path.basename(file))
        .filter((name) => name.toLowerCase().includes("rust"))
        .slice(0, 2);
    assert.deepEqual(limited.map((r) => r.name), expectedNames);
});

test("searchFiles: limit 1 returns exactly the first traversal match", () => {
    const root = makeLimitVault();
    const { results } = searchFiles(root, "rust", { limit: 1 });
    assert.equal(results.length, 1);
    const firstTraversalMatch = traversalOrder(root)
        .map((file) => path.basename(file))
        .find((name) => name.toLowerCase().includes("rust"));
    assert.equal(results[0].name, firstTraversalMatch);
});

test("searchFiles: limit larger than the result count returns everything", () => {
    const root = makeLimitVault();
    const full = searchFiles(root, "rust").results;
    const limited = searchFiles(root, "rust", { limit: 99 }).results;
    assert.equal(limited.length, full.length);
    assert.deepEqual(limited, full);
});

test("searchFiles: limit does not change the result schema or normalized query", () => {
    const root = makeLimitVault();
    const { query, results } = searchFiles(root, "  RUST  ", { limit: 1 });
    assert.equal(query, "rust");
    assert.equal(results.length, 1);
    assert.deepEqual(Object.keys(results[0]).sort(), [
        "name",
        "path",
        "relativePath",
    ]);
});

// ─── fuzzySearchFiles ─────────────────────────────────────────────────

test("fuzzySearchFiles: omitted limit stays unlimited", () => {
    const root = makeLimitVault();
    const { results } = fuzzySearchFiles(root, "rust");
    assert.equal(results.length, 4);
    const scores = results.map((r) => r.score);
    assert.ok(scores.every((s, i) => i === 0 || scores[i - 1] >= s));
});

test("fuzzySearchFiles: limit applies after score ordering", () => {
    const root = makeLimitVault();
    const full = fuzzySearchFiles(root, "rust").results;
    const limited = fuzzySearchFiles(root, "rust", { limit: 2 }).results;

    assert.equal(limited.length, 2);
    assert.deepEqual(limited, full.slice(0, 2));
    assert.ok(limited[0].score >= limited[1].score);
});

test("fuzzySearchFiles: limit 1 keeps only the top-scored result", () => {
    const root = makeLimitVault();
    const full = fuzzySearchFiles(root, "rust").results;
    const limited = fuzzySearchFiles(root, "rust", { limit: 1 }).results;
    assert.equal(limited.length, 1);
    assert.deepEqual(limited[0], full[0]);
});

// ─── searchByContent ──────────────────────────────────────────────────

test("searchByContent: omitted limit stays unlimited", () => {
    const root = makeContentVault();
    const { results } = searchByContent(root, "cargo");
    assert.equal(results.length, 3);
    assert.deepEqual(
        results.map((r) => r.matches),
        [3, 2, 1]
    );
});

test("searchByContent: limit applies after the match-count ordering", () => {
    const root = makeContentVault();
    const full = searchByContent(root, "cargo").results;
    const limited = searchByContent(root, "cargo", { limit: 2 }).results;

    assert.equal(limited.length, 2);
    assert.deepEqual(limited, full.slice(0, 2));
    assert.equal(limited[0].name, "Alpha.md");
    assert.equal(limited[1].name, "Gamma.md");
});

test("searchByContent: limited results keep the H2/H3 fixes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-content-limit-"));
    fs.writeFileSync(
        path.join(root, "Multi.md"),
        "cargo one\ncargo two\ncargo three\ncargo four\ncargo five\ncargo six\n"
    );
    fs.writeFileSync(path.join(root, "Other.md"), "cargo alone\n");

    const { results } = searchByContent(root, "cargo", { limit: 1 });

    assert.equal(results.length, 1);
    assert.equal(results[0].name, "Multi.md");
    assert.equal(results[0].matches, 6);
    assert.equal(results[0].line, 1);
    assert.equal(results[0].snippets.length, 5);
});
