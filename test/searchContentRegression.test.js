// Regression tests for the Phase 2 (Search Foundation v2) content-search
// defects approved for fixing in v1.8.0.
//
//   H2. searchByContent() counted `matches` only while collecting snippets
//       (`while (match && snippets.length < maxSnippets)`), so once a file
//       had more occurrences than `maxSnippets` the reported `matches` value
//       was silently capped at the number of retained snippets.
//
//   H3. `line` was recomputed for every collected snippet, so it ended up
//       pointing at the LAST retained snippet instead of the line of the
//       FIRST content match.
//
// Approved contract encoded here:
//   - `matches` = total matching occurrences in the file (uncapped).
//   - `maxSnippets` only caps how many snippets are collected.
//   - `line` refers to the line containing the first content match.
//   - `snippet` and (when present) `snippets[0]` describe that first match.
//   - Result object structure and CLI-relevant fields stay unchanged.
//
// Conventions follow test/search.test.js: node:test + node:assert/strict and
// isolated `mkdtempSync` vaults. No real Obsidian vault is read or written.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { searchByContent } = require("../utils/search");

function makeContentRoot(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-content-reg-"));
    for (const [name, content] of Object.entries(files)) {
        const full = path.join(root, name);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }
    return root;
}

// ─── H2: matches must count every occurrence ──────────────────────────

test("searchByContent: matches counts every occurrence beyond maxSnippets", () => {
    const lines = [];
    for (let i = 1; i <= 7; i++) lines.push(`cargo occurrence number ${i}`);
    const root = makeContentRoot({ "Multi.md": lines.join("\n") + "\n" });

    const { results } = searchByContent(root, "cargo");

    assert.equal(results.length, 1);
    const result = results[0];
    // Default maxSnippets is 5, but the file holds 7 occurrences.
    assert.equal(result.matches, 7);
    assert.equal(result.snippets.length, 5);
    assert.ok(result.snippets.length <= 5, "maxSnippets must cap snippet collection only");
});

test("searchByContent: maxSnippets only caps snippet collection, not matches", () => {
    const lines = [];
    for (let i = 1; i <= 7; i++) lines.push(`cargo occurrence number ${i}`);
    const root = makeContentRoot({ "Multi.md": lines.join("\n") + "\n" });

    const { results } = searchByContent(root, "cargo", { maxSnippets: 2 });

    assert.equal(results.length, 1);
    assert.equal(results[0].matches, 7);
    assert.equal(results[0].snippets.length, 2);
});

// ─── H3: line must match the first occurrence ─────────────────────────

test("searchByContent: line points to the first match, not the last snippet", () => {
    const root = makeContentRoot({
        "Lines.md":
            "cargo on line one\nfiller\ncargo on line three\nfiller\ncargo on line five\n",
    });

    const { results } = searchByContent(root, "cargo");

    assert.equal(results.length, 1);
    const result = results[0];
    assert.equal(result.matches, 3);
    assert.equal(result.line, 1);
    assert.ok(result.snippet.includes("line one"));
});

test("searchByContent: line stays on the first match when matches exceed maxSnippets", () => {
    const lines = ["filler before"];
    for (let i = 1; i <= 6; i++) lines.push(`cargo number ${i}`);
    const root = makeContentRoot({ "Multi.md": lines.join("\n") + "\n" });

    const { results } = searchByContent(root, "cargo");

    assert.equal(results.length, 1);
    const result = results[0];
    // First match is on line 2; occurrences 6 > default maxSnippets 5.
    assert.equal(result.matches, 6);
    assert.equal(result.snippets.length, 5);
    assert.equal(result.line, 2);
});

test("searchByContent: line is the first match line even with maxSnippets 1", () => {
    const root = makeContentRoot({
        "Lines.md": "filler\ncargo first\nfiller\ncargo second\n",
    });

    const { results } = searchByContent(root, "cargo", { maxSnippets: 1 });

    assert.equal(results.length, 1);
    const result = results[0];
    assert.equal(result.matches, 2);
    assert.equal(result.snippets.length, 1);
    assert.equal(result.line, 2);
});

// ─── First-match identity: snippet / snippets[0] ──────────────────────

test("searchByContent: snippet and snippets[0] describe the first match", () => {
    const root = makeContentRoot({
        "First.md": "cargo ALPHA marker\ncargo OMEGA marker\n",
    });

    const { results } = searchByContent(root, "cargo", { contextRadius: 8 });

    assert.equal(results.length, 1);
    const result = results[0];
    assert.equal(result.snippet, result.snippets[0]);
    assert.ok(result.snippet.includes("ALPHA"));
    assert.ok(!result.snippet.includes("OMEGA"));
});

test("searchByContent: result schema is unchanged for multi-match files", () => {
    const root = makeContentRoot({
        "Shape.md": "cargo one\ncargo two\ncargo three\n",
    });

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
    assert.equal(result.matches, 3);
    assert.equal(result.line, 1);
    assert.equal(typeof result.snippet, "string");
    assert.ok(Array.isArray(result.snippets));
});

// ─── Interaction with the length-expanding lowercase fold (U+0130) ───

test("searchByContent: multi-occurrence line numbers survive an İ prefix", () => {
    const root = makeContentRoot({
        "Istanbul.md": "İstanbul cargo one\nfiller\ncargo two\nfiller\ncargo three\n",
    });

    const { results } = searchByContent(root, "cargo");

    assert.equal(results.length, 1);
    const result = results[0];
    assert.equal(result.matches, 3);
    assert.equal(result.line, 1);
});

test("searchByContent: multi-occurrence CRLF files keep the first-match line", () => {
    const root = makeContentRoot({
        "Crlf.md": "cargo one\r\nfiller\r\ncargo two\r\nfiller\r\ncargo three\r\n",
    });

    const { results } = searchByContent(root, "cargo");

    assert.equal(results.length, 1);
    const result = results[0];
    assert.equal(result.matches, 3);
    assert.equal(result.line, 1);
    assert.ok(!/[\r\n]/.test(result.snippet));
});

// ─── Custom options stay preserved ────────────────────────────────────

test("searchByContent: maxBytes skips files larger than the cap", () => {
    const root = makeContentRoot({
        "Small.md": "cargo\n",
        "Large.md": "cargo plus enough padding to exceed the cap\n",
    });

    const limited = searchByContent(root, "cargo", { maxBytes: 6 });
    assert.deepEqual(
        limited.results.map((r) => r.name),
        ["Small.md"]
    );

    // Default behavior (no maxBytes option) is unchanged: both files match.
    const unlimited = searchByContent(root, "cargo");
    assert.equal(unlimited.results.length, 2);
});

test("searchByContent: custom excludeDirs replaces the default exclusions", () => {
    const root = makeContentRoot({
        ".obsidian/workspace.md": "cargo in workspace\n",
        "Notes/Alpha.md": "cargo in notes\n",
    });

    // Established `||` semantics: passing excludeDirs replaces the defaults,
    // so `.obsidian` is no longer excluded while `Notes` now is.
    const { results } = searchByContent(root, "cargo", {
        excludeDirs: ["Notes"],
    });
    assert.deepEqual(
        results.map((r) => r.relativePath),
        [".obsidian/workspace.md"]
    );
});

test("searchByContent: combined custom options are all honored", () => {
    const root = makeContentRoot({
        "Notes/Rust.txt": "cargo 1\ncargo 2\ncargo 3\ncargo 4\n",
        "Notes/Rust.md": "cargo md\n",
        ".obsidian/workspace.md": "cargo ws\n",
    });

    const { results } = searchByContent(root, "cargo", {
        extensions: [".txt"],
        excludeDirs: [".obsidian"],
        maxSnippets: 1,
        contextRadius: 0,
    });

    assert.equal(results.length, 1);
    const result = results[0];
    assert.equal(result.relativePath, "Notes/Rust.txt");
    assert.equal(result.matches, 4);
    assert.equal(result.line, 1);
    assert.equal(result.snippets.length, 1);
    // contextRadius 0: the snippet is exactly the first matched text.
    assert.equal(result.snippet, "cargo");
    assert.equal(result.snippet, result.snippets[0]);
});

// ─── Unicode / path edge cases in the changed code path ───────────────

test("searchByContent: counts every match in nested paths with spaces and Unicode", () => {
    const root = makeContentRoot({
        "Catatan Ünïcode/Rüst Cargo.md":
            "filler\nИндонезия cargo one\ncargo two\nfiller\ncargo three\nfiller\n" +
            "cargo four\nfiller\ncargo five\nfiller\ncargo six\n",
    });

    const { results } = searchByContent(root, "cargo");

    assert.equal(results.length, 1);
    const result = results[0];
    assert.equal(result.relativePath, "Catatan Ünïcode/Rüst Cargo.md");
    assert.ok(!result.relativePath.includes("\\"));
    // First content match is on line 2; six occurrences exceed the default
    // maxSnippets of 5.
    assert.equal(result.line, 2);
    assert.equal(result.matches, 6);
    assert.equal(result.snippets.length, 5);
    assert.ok(result.snippet.includes("Индонезия"));
});
