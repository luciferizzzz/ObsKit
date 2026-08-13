const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    normalizeNoteRef,
    isDuplicate,
    isSelfReference,
    isValidLink,
} = require("../utils/relationship/validator");

test("normalizeNoteRef: strips .md extension", () => {
    assert.equal(normalizeNoteRef("Home.md"), "home");
});

test("normalizeNoteRef: strips heading, alias, and folder", () => {
    assert.equal(normalizeNoteRef("Projects/Home#Setup|Hi.md"), "home");
});

test("normalizeNoteRef: lowercases and trims", () => {
    assert.equal(normalizeNoteRef("  Home  "), "home");
});

test("isDuplicate: detects existing link in string list", () => {
    assert.equal(isDuplicate(["Home", "Rust"], "home"), true);
    assert.equal(isDuplicate(["Home", "Rust"], "Go"), false);
});

test("isDuplicate: detects existing link in parsed link list", () => {
    const links = [{ target: "Home" }, { target: "Rust", alias: "R" }];
    assert.equal(isDuplicate(links, "Home.md"), true);
    assert.equal(isDuplicate(links, "Rust"), true);
    assert.equal(isDuplicate(links, "Go"), false);
});

test("isSelfReference: detects same note", () => {
    assert.equal(isSelfReference("Home", "home.md"), true);
    assert.equal(isSelfReference("Home", "Rust"), false);
});

test("isValidLink: checks against note index", () => {
    const notes = new Set(["Home", "Rust", "Learning Rust"]);
    assert.equal(isValidLink(notes, "home"), true);
    assert.equal(isValidLink(notes, "learning rust"), true);
    assert.equal(isValidLink(notes, "Go"), false);
});
