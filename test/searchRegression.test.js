// Regression tests for two search bugs targeted by the v1.7.1 hotfix.
//
//   1. Windows relative-path separator inconsistency (utils/search.js)
//      -> searchFiles() / fuzzySearchFiles() / searchByContent() build
//         `relativePath` with a raw `path.relative()`, which yields
//         backslashes on Windows.
//
//   2. Unicode-unsafe match offsets in searchByContent() (utils/search.js)
//      -> the content is lowercased into `lower`, but the match index from
//         `lower` is then used to slice the *original* content, so any
//         character whose lowercase form changes length shifts every
//         subsequent offset (line numbers and snippets).
//
// These tests encode the *correct* contract. They are expected to FAIL
// against the unfixed implementation and PASS once the fixes land.
//
// Conventions follow test/search.test.js: node:test + node:assert/strict and
// isolated `mkdtempSync` vaults. No real Obsidian vault is read or written.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { searchFiles, fuzzySearchFiles, searchByContent } = require("../utils/search");

function makeNestedVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-search-reg-"));
    fs.mkdirSync(path.join(root, "Notes"), { recursive: true });
    fs.writeFileSync(
        path.join(root, "Notes", "A.md"),
        "# A\n\nalpha cargo here\n"
    );
    return root;
}

function makeContentRoot(content, fileName = "Istanbul.md") {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-search-reg-"));
    fs.writeFileSync(path.join(root, fileName), content);
    return root;
}

// ─── Bug 1: relative-path separator ──────────────────────────────────
// Contract: vault-relative paths are always forward-slash, matching the
// paths printed by `obs list`, `obs recent`, `obs tags` and documented for
// `obs find` (docs/COMMANDS.md). Absolute `path` stays platform-native.

test("searchFiles: relativePath uses forward slashes on every platform", () => {
    const root = makeNestedVault();
    const { results } = searchFiles(root, "A");

    assert.equal(results.length, 1);
    const result = results[0];

    assert.equal(result.relativePath, "Notes/A.md");
    assert.ok(
        !result.relativePath.includes("\\"),
        `relativePath must not contain backslashes, got ${JSON.stringify(
            result.relativePath
        )}`
    );

    // Absolute path stays platform-native.
    assert.equal(result.path, path.join(root, "Notes", "A.md"));
    assert.ok(path.isAbsolute(result.path));
});

test("fuzzySearchFiles: relativePath uses forward slashes on every platform", () => {
    const root = makeNestedVault();
    const { results } = fuzzySearchFiles(root, "a");

    assert.equal(results.length, 1);
    assert.equal(results[0].relativePath, "Notes/A.md");
    assert.ok(!results[0].relativePath.includes("\\"));
    assert.equal(results[0].path, path.join(root, "Notes", "A.md"));
});

test("searchByContent: relativePath uses forward slashes on every platform", () => {
    const root = makeNestedVault();
    const { results } = searchByContent(root, "cargo");

    assert.equal(results.length, 1);
    assert.equal(results[0].relativePath, "Notes/A.md");
    assert.ok(!results[0].relativePath.includes("\\"));
    assert.equal(results[0].path, path.join(root, "Notes", "A.md"));
});

// ─── Bug 2: Unicode-unsafe offsets in searchByContent ────────────────
// "İ" (U+0130) lowercases to two code units ("i" + U+0307), so every match
// after it has a larger index in the lowercased copy than in the original.

test("searchByContent: line number stays correct after a length-expanding lowercase char", () => {
    const root = makeContentRoot("İİİİİİ cargo\nsecond line\n");

    const { results } = searchByContent(root, "cargo");

    assert.equal(results.length, 1);
    assert.equal(results[0].matches, 1);
    // "cargo" is on the first line; nothing before it contains a newline.
    assert.equal(results[0].line, 1);
});

test("searchByContent: snippet keeps the matched text after a length-expanding char", () => {
    const root = makeContentRoot("İstanbul cargo\n");

    const { results } = searchByContent(root, "cargo", { contextRadius: 0 });

    assert.equal(results.length, 1);
    const result = results[0];

    // With zero context the snippet is exactly the matched text taken from
    // the original (case-preserved) content.
    assert.equal(result.snippet, "cargo");
    assert.ok(result.snippet.includes("cargo"));
    assert.equal(result.snippet, result.snippets[0]);
});

test("searchByContent: case-insensitive match finds Unicode-prefixed content", () => {
    const root = makeContentRoot("İSTANBUL CARGO\n");

    const { results } = searchByContent(root, "cargo");

    assert.equal(results.length, 1);
    assert.ok(results[0].snippet.toLowerCase().includes("cargo"));
    assert.ok(results[0].matches >= 1);
});

test("searchByContent: CRLF content keeps line numbers and single-line snippets", () => {
    const root = makeContentRoot("line one\r\nİstanbul cargo\r\nline three\r\n");

    const { results } = searchByContent(root, "cargo");

    assert.equal(results.length, 1);
    assert.equal(results[0].line, 2);
    assert.ok(results[0].snippet.includes("cargo"));
    assert.ok(!/[\r\n]/.test(results[0].snippet));
});

test("searchByContent: result shape is unchanged", () => {
    const root = makeContentRoot("cargo once\n", "Shape.md");

    const { query, results } = searchByContent(root, "cargo");

    assert.equal(query, "cargo");
    assert.equal(results.length, 1);

    const result = results[0];
    assert.deepEqual(Object.keys(result).sort(), [
        "line",
        "matches",
        "name",
        "path",
        "relativePath",
        "snippet",
        "snippets",
    ]);
    assert.equal(result.name, "Shape.md");
    assert.equal(result.path, path.join(root, "Shape.md"));
    assert.equal(result.matches, 1);
    assert.equal(typeof result.line, "number");
    assert.ok(Array.isArray(result.snippets));
    assert.equal(result.snippet, result.snippets[0]);
});
