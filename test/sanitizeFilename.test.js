const { test } = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeFilename, mdFileName } = require("../utils/sanitizeFilename");

test("sanitize: keeps normal ASCII names unchanged", () => {
    assert.equal(mdFileName("Meeting with Team"), "Meeting with Team.md");
    assert.equal(mdFileName("2026-09-14"), "2026-09-14.md");
});

test("sanitize: removes Windows-illegal characters", () => {
    for (const illegal of ['<', '>', ':', '"', '/', '\\', '|', '?', '*']) {
        assert.ok(!mdFileName(`Name${illegal}Test`).includes(illegal), `removes ${illegal}`);
    }
});

test("sanitize: collapses whitespace runs to a single space", () => {
    assert.equal(mdFileName("Title\nwith\nnewlines"), "Title with newlines.md");
    assert.equal(mdFileName("Title\ttabbed"), "Title tabbed.md");
    assert.equal(mdFileName("  padded  name  "), "padded name.md");
});

test("sanitize: removes non-whitespace control characters", () => {
    assert.equal(mdFileName("Note\u0000with\u0007ctrl"), "Notewithctrl.md");
    assert.equal(mdFileName("Bell\u0007ding"), "Bellding.md");
});

test("sanitize: strips trailing dots from titles", () => {
    assert.equal(mdFileName("Note."), "Note.md");
    assert.equal(mdFileName("Title..."), "Title.md");
    assert.equal(mdFileName("version 1.0"), "version 1.0.md");
});

test("sanitize: preserves existing .md extension exactly", () => {
    assert.equal(mdFileName("README.md"), "README.md");
    assert.equal(mdFileName("README.MD"), "README.md");
});

test("sanitize: preserves Unicode characters", () => {
    assert.equal(mdFileName("AI 实践研究"), "AI 实践研究.md");
});

test("sanitize: preserves emoji characters", () => {
    assert.equal(mdFileName("Belajar React 🚀"), "Belajar React 🚀.md");
});

test("sanitize: strips surrounding whitespace", () => {
    assert.equal(mdFileName("   trim me   "), "trim me.md");
});

test("sanitize: empty or all-illegal output becomes empty base", () => {
    assert.equal(mdFileName("***"), ".md");
});

test("sanitizeFilename: exposes both exports", () => {
    const mod = require("../utils/sanitizeFilename");
    assert.equal(typeof mod, "function");
    assert.equal(typeof mod.sanitizeFilename, "function");
    assert.equal(typeof mod.mdFileName, "function");
});