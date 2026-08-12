const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    normalizeQuery,
    fileNameMatches,
    walkFiles,
    searchFiles,
    searchNotes,
} = require("../utils/search");

function makeVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-search-"));
    fs.writeFileSync(path.join(root, "Learning Rust.md"), "# Rust\n");
    fs.writeFileSync(path.join(root, "Rust.md"), "# Rust\n");
    fs.writeFileSync(path.join(root, "Notes.txt"), "txt\n");
    fs.mkdirSync(path.join(root, "Sub"), { recursive: true });
    fs.writeFileSync(path.join(root, "Sub", "Cargo.md"), "# Cargo\n");
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    fs.writeFileSync(path.join(root, ".git", "HEAD.md"), "git config\n");
    fs.mkdirSync(path.join(root, ".obsidian"), { recursive: true });
    fs.writeFileSync(path.join(root, ".obsidian", "workspace.md"), "ws\n");
    return root;
}

test("normalizeQuery: trims and lowercases", () => {
    assert.equal(normalizeQuery("  RuSt  "), "rust");
    assert.equal(normalizeQuery(""), "");
    assert.equal(normalizeQuery(null), "");
});

test("fileNameMatches: case-insensitive substring", () => {
    assert.equal(fileNameMatches("Learning Rust.md", "rust"), true);
    assert.equal(fileNameMatches("Learning Rust.md", "RUST"), true);
    assert.equal(fileNameMatches("Learning Rust.md", "xyz"), false);
    assert.equal(fileNameMatches("Learning Rust.md", ""), false);
});

test("searchFiles: finds exact match", () => {
    const root = makeVault();
    const { query, results } = searchFiles(root, "Learning Rust");
    assert.equal(query, "learning rust");
    assert.equal(results.length, 1);
    assert.equal(results[0].relativePath, "Learning Rust.md");
});

test("searchFiles: returns multiple results", () => {
    const root = makeVault();
    const { results } = searchFiles(root, "rust");
    assert.equal(results.length, 2);
    const names = results.map((r) => r.name);
    assert.ok(names.includes("Learning Rust.md"));
    assert.ok(names.includes("Rust.md"));
});

test("searchFiles: no results returns empty array", () => {
    const root = makeVault();
    const { results } = searchFiles(root, "zzz");
    assert.deepEqual(results, []);
});

test("searchFiles: empty query returns no results", () => {
    const root = makeVault();
    const { results } = searchFiles(root, "  ");
    assert.deepEqual(results, []);
});

test("searchFiles: finds nested files with relative paths", () => {
    const root = makeVault();
    const { results } = searchFiles(root, "cargo");
    assert.equal(results.length, 1);
    assert.equal(results[0].relativePath, path.join("Sub", "Cargo.md"));
});

test("searchFiles: matches any file type by default (find compatibility)", () => {
    const root = makeVault();
    const { results } = searchFiles(root, "notes");
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "Notes.txt");
});

test("searchFiles: default includes hidden directories (find compatibility)", () => {
    const root = makeVault();
    const { results } = searchFiles(root, "workspace");
    assert.equal(results.length, 1);
    assert.equal(results[0].relativePath, path.join(".obsidian", "workspace.md"));
});

test("searchFiles: supports excluding directories", () => {
    const root = makeVault();
    const { results } = searchFiles(root, "workspace", {
        excludeDirs: [".obsidian"],
    });
    assert.deepEqual(results, []);
});

test("searchNotes: only matches markdown files", () => {
    const root = makeVault();
    const { results } = searchNotes(root, "notes");
    assert.equal(results.length, 0);

    const { results: md } = searchNotes(root, "rust");
    assert.equal(md.length, 2);
});

test("walkFiles: returns all files recursively", () => {
    const root = makeVault();
    const files = walkFiles(root);
    assert.equal(files.length, 6);
});

test("walkFiles: filters by extension", () => {
    const root = makeVault();
    const files = walkFiles(root, { extensions: [".md"] });
    assert.ok(files.every((f) => f.endsWith(".md")));
    assert.equal(files.filter((f) => f.endsWith(".txt")).length, 0);
});

test("searchFiles: missing root returns no results", () => {
    const { results } = searchFiles(
        path.join(os.tmpdir(), "does-not-exist-xyz"),
        "rust"
    );
    assert.deepEqual(results, []);
});
