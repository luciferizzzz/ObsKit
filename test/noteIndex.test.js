const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    buildNoteIndex,
    buildNormalizedNoteIndex,
    buildFilePathMap,
} = require("../utils/noteIndex");

function makeFiles() {
    const sep = path.sep;
    return [
        `${sep}vault${sep}Home.md`,
        `${sep}vault${sep}Rust.md`,
        `${sep}vault${sep}Notes${sep}Note A.md`,
        `${sep}vault${sep}notes${sep}duplicate.md`,
    ];
}

test("buildNoteIndex: collects basenames without extension", () => {
    const index = buildNoteIndex(makeFiles());
    assert.ok(index.has("Home"));
    assert.ok(index.has("Rust"));
    assert.ok(index.has("Note A"));
    assert.equal(index.size, 4);
});

test("buildNormalizedNoteIndex: lowercases basenames", () => {
    const index = buildNormalizedNoteIndex(makeFiles());
    assert.ok(index.has("home"));
    assert.ok(index.has("note a"));
    assert.equal(index.has("Note A"), false);
});

test("buildFilePathMap: maps basename to full path", () => {
    const files = makeFiles();
    const map = buildFilePathMap(files);
    assert.equal(map.get("Home"), path.join(path.sep, "vault", "Home.md"));
    assert.equal(
        map.get("Note A"),
        path.join(path.sep, "vault", "Notes", "Note A.md")
    );
    assert.equal(map.has("missing"), false);
});

test("helpers: consistent with each other on the same file list", () => {
    const files = makeFiles();
    const names = buildNoteIndex(files);
    const fileByNote = buildFilePathMap(files);

    for (const name of names) {
        assert.ok(fileByNote.get(name));
    }
});
