// Ordering and traversal-semantics tests for searchFiles() (Phase 2 scope D).
//
// The approved scope explicitly forbids adding sorting to searchFiles().
// These tests pin the established semantics so any refactor that introduces
// a sort (or otherwise reorders, re-hides, or re-filters traversal) fails:
//
//   - results follow the fs.readdir depth-first traversal order,
//   - hidden directories are still traversed by default,
//   - extension filtering behaves exactly as before (all types when no
//     `extensions` option is given).
//
// The fixture uses mixed-case names: on this platform readdir order differs
// from a default lexicographic sort, which makes the ordering assertions
// discriminating. The expected order is computed at runtime from fs itself,
// never hardcoded.
//
// Conventions follow test/search.test.js: node:test + node:assert/strict and
// isolated `mkdtempSync` vaults.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { searchFiles, walkFiles } = require("../utils/search");

// Independent depth-first readdir oracle, implemented directly from fs.
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

function normalize(relative) {
    return relative.split(path.sep).join("/");
}

function makeMixedVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-search-order-"));
    // Creation order deliberately differs from lexicographic order.
    fs.writeFileSync(path.join(root, "Rust Zulu.md"), "# zulu\n");
    fs.mkdirSync(path.join(root, "Sub"), { recursive: true });
    fs.writeFileSync(path.join(root, "Sub", "rust nested.md"), "# nested\n");
    fs.writeFileSync(path.join(root, "rust apple.md"), "# apple\n");
    fs.writeFileSync(path.join(root, "Rust Banana.md"), "# banana\n");
    fs.writeFileSync(path.join(root, "Cargo.md"), "# cargo\n");
    return root;
}

test("searchFiles: results follow readdir depth-first traversal order (no sorting)", () => {
    const root = makeMixedVault();
    const { results } = searchFiles(root, "rust");

    const expected = traversalOrder(root)
        .map((file) => normalize(path.relative(root, file)))
        .filter((relative) => path.basename(relative).toLowerCase().includes("rust"));

    assert.ok(expected.length >= 3, "fixture must produce multiple matches");
    assert.deepEqual(
        results.map((r) => r.relativePath),
        expected
    );

    // Fixture sanity: traversal order must differ from a lexicographic sort,
    // otherwise this test could not detect an introduced sort.
    assert.notDeepEqual(
        expected,
        [...expected].sort(),
        "fixture must distinguish traversal order from sorted order"
    );
});

test("searchFiles: result order equals walkFiles traversal order", () => {
    const root = makeMixedVault();
    const { results } = searchFiles(root, "rust");

    const fromWalkFiles = walkFiles(root)
        .map((file) => normalize(path.relative(root, file)))
        .filter((relative) => path.basename(relative).toLowerCase().includes("rust"));

    assert.deepEqual(
        results.map((r) => r.relativePath),
        fromWalkFiles
    );
});

test("searchFiles: subdirectories are visited in place (depth-first), not hoisted", () => {
    const root = makeMixedVault();
    const { results } = searchFiles(root, "rust");

    const expected = traversalOrder(root)
        .map((file) => normalize(path.relative(root, file)))
        .filter((relative) => path.basename(relative).toLowerCase().includes("rust"));
    // The nested file keeps whatever position readdir assigns to its
    // directory — results are neither sorted nor grouped.
    assert.deepEqual(results.map((r) => r.relativePath), expected);
    assert.ok(
        results.some((r) => r.relativePath.startsWith("Sub/")),
        "nested file must be present"
    );
});

test("searchFiles: hidden directories are still traversed by default", () => {
    const root = makeMixedVault();
    fs.mkdirSync(path.join(root, ".hidden"), { recursive: true });
    fs.writeFileSync(path.join(root, ".hidden", "rust hidden.md"), "# hidden\n");

    const { results } = searchFiles(root, "rust hidden");
    assert.equal(results.length, 1);
    assert.equal(results[0].relativePath, ".hidden/rust hidden.md");

    // And the traversal-order contract still holds with the hidden folder in
    // the fixture.
    const all = searchFiles(root, "rust");
    const expected = traversalOrder(root)
        .map((file) => normalize(path.relative(root, file)))
        .filter((relative) => path.basename(relative).toLowerCase().includes("rust"));
    assert.deepEqual(all.results.map((r) => r.relativePath), expected);
});

test("searchFiles: extension filter behavior is unchanged", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-search-order-"));
    fs.writeFileSync(path.join(root, "Rust One.md"), "# md\n");
    fs.writeFileSync(path.join(root, "Rust Two.txt"), "txt\n");
    fs.mkdirSync(path.join(root, "Notes"), { recursive: true });
    fs.writeFileSync(path.join(root, "Notes", "Rust Three.md"), "# md\n");

    // No `extensions` option: every file type matches (find compatibility).
    const all = searchFiles(root, "rust");
    assert.deepEqual(
        all.results.map((r) => r.relativePath),
        traversalOrder(root)
            .map((file) => normalize(path.relative(root, file)))
            .filter((relative) => path.basename(relative).toLowerCase().includes("rust"))
    );
    assert.ok(all.results.some((r) => r.relativePath.endsWith(".txt")));

    // Explicit filter: only the requested type, still in traversal order.
    const md = searchFiles(root, "rust", { extensions: [".md"] });
    const mdExpected = traversalOrder(root)
        .map((file) => normalize(path.relative(root, file)))
        .filter(
            (relative) =>
                relative.endsWith(".md") &&
                path.basename(relative).toLowerCase().includes("rust")
        );
    assert.deepEqual(md.results.map((r) => r.relativePath), mdExpected);
    assert.ok(md.results.every((r) => r.relativePath.endsWith(".md")));
    assert.equal(md.results.length, 2);
});
