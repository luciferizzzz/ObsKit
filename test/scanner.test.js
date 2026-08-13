const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    findNoteFile,
    scanOutgoingLinks,
    scanIncomingLinks,
    scanRelatedLinks,
    collectRelationships,
} = require("../utils/relationship/scanner");

function makeVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-rel-"));
    fs.writeFileSync(path.join(root, "Home.md"), "Home\n\n[[Rust]]\n[[Note A]]");
    fs.writeFileSync(path.join(root, "Rust.md"), "Rust\n\n## Related\n- [[Home]]\n");
    fs.writeFileSync(path.join(root, "Note A.md"), "A\n");
    fs.mkdirSync(path.join(root, "Sub"));
    fs.writeFileSync(path.join(root, "Sub", "Nested.md"), "[[rust]]");
    return root;
}

function listFiles(root) {
    return fs.readdirSync(root, { recursive: true })
        .filter((entry) => typeof entry === "string" && entry.endsWith(".md"))
        .map((entry) => path.join(root, entry));
}

test("findNoteFile: finds by basename case-insensitively", () => {
    const root = makeVault();
    const files = listFiles(root);
    assert.equal(path.basename(findNoteFile(files, "home"), ".md"), "Home");
    assert.equal(path.basename(findNoteFile(files, "NOTE A"), ".md"), "Note A");
    assert.equal(findNoteFile(files, "missing"), null);
});

test("findNoteFile: finds note in subfolder", () => {
    const root = makeVault();
    const files = listFiles(root);
    assert.equal(path.basename(findNoteFile(files, "nested"), ".md"), "Nested");
});

test("scanOutgoingLinks: parses outgoing links per note", () => {
    const root = makeVault();
    const files = listFiles(root);
    const outgoing = scanOutgoingLinks(files);
    assert.deepEqual(outgoing.Home.map((l) => l.target), ["Rust", "Note A"]);
    assert.deepEqual(outgoing["Note A"], []);
});

test("scanIncomingLinks: collects backlinks by normalized name", () => {
    const root = makeVault();
    const files = listFiles(root);
    const incoming = scanIncomingLinks(files);
    assert.deepEqual(incoming.rust.map((l) => l.source), ["Home", "Nested"]);
    assert.deepEqual(incoming["note a"].map((l) => l.source), ["Home"]);
});

test("scanRelatedLinks: reads links from Related section only", () => {
    const root = makeVault();
    const files = listFiles(root);
    const related = scanRelatedLinks(files, "Rust");
    assert.deepEqual(related.map((l) => l.target), ["Home"]);
});

test("scanRelatedLinks: returns empty for notes without Related section", () => {
    const root = makeVault();
    const files = listFiles(root);
    assert.deepEqual(scanRelatedLinks(files, "Home"), []);
});

test("collectRelationships: returns both maps", () => {
    const root = makeVault();
    const files = listFiles(root);
    const { outgoing, incoming } = collectRelationships(files);
    assert.equal(typeof outgoing, "object");
    assert.equal(typeof incoming, "object");
    assert.ok(outgoing.Home.length >= 2);
});
