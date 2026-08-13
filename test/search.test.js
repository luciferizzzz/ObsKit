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
    fuzzyScore,
    fuzzyMatches,
    fuzzySearchFiles,
    fuzzySearchNotes,
    rankResults,
    searchByContent,
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

function makeContentVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-content-"));
    fs.mkdirSync(path.join(root, "Notes"), { recursive: true });
    fs.writeFileSync(
        path.join(root, "Notes", "Alpha.md"),
        "# Alpha\n\nRust and cargo are awesome.\n"
    );
    fs.writeFileSync(
        path.join(root, "Notes", "Beta.md"),
        "# Beta\n\nNo mention here.\n"
    );
    fs.mkdirSync(path.join(root, ".obsidian"), { recursive: true });
    fs.writeFileSync(path.join(root, ".obsidian", "workspace.json"), '{"rust": true}');
    fs.writeFileSync(path.join(root, "Log.txt"), "rust in txt\n");
    return root;
}

test("fuzzyMatches: matches subsequence (typo-tolerant)", () => {
    assert.equal(fuzzyMatches("lern rust", "Learning Rust.md"), true);
    assert.equal(fuzzyMatches("rust", "Learning Rust.md"), true);
    assert.equal(fuzzyMatches("rust", "Cargo.md"), false);
    assert.equal(fuzzyMatches("", "Cargo.md"), false);
});

test("fuzzyScore: exact beats prefix beats substring beats subsequence", () => {
    const exact = fuzzyScore("rust.md", "Rust.md");
    const prefix = fuzzyScore("rust", "Rust Notes.md");
    const sub = fuzzyScore("rust", "Learning Rust.md");
    const fuzzy = fuzzyScore("rst", "Learning Rust.md");
    assert.ok(exact > prefix);
    assert.ok(prefix > sub);
    assert.ok(sub > fuzzy);
    assert.equal(fuzzyScore("xyz", "Rust.md"), null);
});

test("fuzzySearchFiles: finds typo-tolerant matches", () => {
    const root = makeVault();
    const { results } = fuzzySearchFiles(root, "lrning rust");
    const paths = results.map((r) => r.relativePath);
    assert.ok(paths.includes("Learning Rust.md"));
    assert.ok(results.every((r) => r.score >= 0));
});

test("fuzzySearchFiles: sorts by score descending", () => {
    const root = makeVault();
    const { results } = fuzzySearchFiles(root, "rust");
    assert.equal(results[0].name, "Rust.md");
    const scores = results.map((r) => r.score);
    assert.ok(scores.every((s, i) => i === 0 || scores[i - 1] >= s));
});

test("fuzzySearchNotes: only matches markdown files", () => {
    const root = makeVault();
    const { results } = fuzzySearchNotes(root, "notes");
    assert.equal(results.length, 0);

    const { results: md } = fuzzySearchNotes(root, "rust");
    assert.equal(md.length, 2);
});

test("rankResults: orders exact, prefix, then substring", () => {
    const root = makeVault();
    const { results } = searchFiles(root, "rust");
    const ranked = rankResults(results, "rust");
    assert.equal(ranked[0].name, "Rust.md");
    assert.equal(ranked[1].name, "Learning Rust.md");
    assert.ok(ranked[0].score > ranked[1].score);
});

test("searchByContent: finds matching content in notes", () => {
    const root = makeContentVault();
    const { results } = searchByContent(root, "cargo");
    assert.equal(results.length, 1);
    assert.equal(results[0].relativePath, path.join("Notes", "Alpha.md"));
    assert.equal(results[0].line, 3);
    assert.ok(results[0].snippet.includes("cargo"));
    assert.ok(results[0].matches >= 1);
});

test("searchByContent: skips hidden directories by default", () => {
    const root = makeContentVault();
    const { results } = searchByContent(root, "rust");
    const paths = results.map((r) => r.relativePath);
    assert.ok(paths.includes(path.join("Notes", "Alpha.md")));
    assert.ok(!paths.some((p) => p.includes(".obsidian")));
});

test("searchByContent: only markdown by default", () => {
    const root = makeContentVault();
    const { results } = searchByContent(root, "rust");
    const paths = results.map((r) => r.relativePath);
    assert.ok(paths.includes(path.join("Notes", "Alpha.md")));
    assert.ok(!paths.includes("Log.txt"));
});

test("searchByContent: empty query returns no results", () => {
    const root = makeContentVault();
    const { results } = searchByContent(root, "  ");
    assert.deepEqual(results, []);
});

test("searchByContent: supports extension filter", () => {
    const root = makeContentVault();
    const { results } = searchByContent(root, "rust", { extensions: [".txt"] });
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "Log.txt");
});
