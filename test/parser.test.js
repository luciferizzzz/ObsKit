const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    parseWikiLinks,
    normalizeTarget,
    normalizeLink,
    parseHeadings,
    getSectionContent,
} = require("../utils/relationship/parser");

test("parseWikiLinks: basic link", () => {
    const links = parseWikiLinks("Hello [[Home]]");
    assert.deepEqual(links, [
        { target: "Home", alias: null, heading: null, raw: "Home" },
    ]);
});

test("parseWikiLinks: link with alias", () => {
    const links = parseWikiLinks("[[Rust|Learning Rust]]");
    assert.deepEqual(links, [
        { target: "Rust", alias: "Learning Rust", heading: null, raw: "Rust|Learning Rust" },
    ]);
});

test("parseWikiLinks: link with heading", () => {
    const links = parseWikiLinks("[[Home#Setup]]");
    assert.deepEqual(links, [
        { target: "Home", alias: null, heading: "Setup", raw: "Home#Setup" },
    ]);
});

test("parseWikiLinks: link with heading and alias", () => {
    const links = parseWikiLinks("[[Home#Setup|Getting Started]]");
    assert.deepEqual(links, [
        { target: "Home", alias: "Getting Started", heading: "Setup", raw: "Home#Setup|Getting Started" },
    ]);
});

test("parseWikiLinks: folder path is stripped", () => {
    const links = parseWikiLinks("[[Projects/Website]]");
    assert.deepEqual(links, [
        { target: "Website", alias: null, heading: null, raw: "Projects/Website" },
    ]);
});

test("parseWikiLinks: block reference", () => {
    const links = parseWikiLinks("[[Note#^blockId]]");
    assert.deepEqual(links, [
        { target: "Note", alias: null, heading: "^blockId", raw: "Note#^blockId" },
    ]);
});

test("parseWikiLinks: skips attachments", () => {
    assert.equal(parseWikiLinks("[[image.png]] [[photo.jpg]] [[clip.pdf]]").length, 0);
});

test("parseWikiLinks: skips empty links", () => {
    assert.equal(parseWikiLinks("[[ ]] [[]]").length, 0);
});

test("parseWikiLinks: multiple links", () => {
    const links = parseWikiLinks("[[A]] and [[B|Bee]] and [[C#See]]");
    assert.equal(links.length, 3);
    assert.deepEqual(links.map((l) => l.target), ["A", "B", "C"]);
});

test("normalizeTarget: strips heading, alias, and folder", () => {
    assert.equal(normalizeTarget("Home"), "home");
    assert.equal(normalizeTarget("Projects/Home#Setup|Hi"), "home");
    assert.equal(normalizeTarget("  Home  "), "home");
});

test("normalizeLink: normalizes a raw link string", () => {
    assert.equal(normalizeLink("Projects/Home#Setup|Hi"), "home");
});

test("normalizeLink: handles object links", () => {
    assert.equal(normalizeLink({ target: "Home" }), "home");
});

test("parseHeadings: extracts headings with levels", () => {
    const headings = parseHeadings("# Title\n\n## Related\n\n### Sub");
    assert.deepEqual(headings, [
        { level: 1, text: "Title" },
        { level: 2, text: "Related" },
        { level: 3, text: "Sub" },
    ]);
});

test("getSectionContent: extracts a section", () => {
    const content = "# Title\n\n## Related\n- [[A]]\n- [[B]]\n\n## Other\n\nText";
    assert.equal(getSectionContent(content, "Related"), "- [[A]]\n- [[B]]");
});

test("getSectionContent: returns empty string when section missing", () => {
    assert.equal(getSectionContent("## Other", "Related"), "");
});
