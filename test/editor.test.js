const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    RELATED_HEADING,
    detectNewline,
    ensureSection,
    addRelated,
    removeRelated,
} = require("../utils/relationship/editor");

test("detectNewline: detects CRLF and LF", () => {
    assert.equal(detectNewline("a\r\nb"), "\r\n");
    assert.equal(detectNewline("a\nb"), "\n");
});

test("ensureSection: appends missing section", () => {
    const { content, added } = ensureSection("Some content", "Related");
    assert.equal(added, true);
    assert.equal(content, "Some content\n\n## Related\n");
});

test("ensureSection: keeps existing section", () => {
    const original = "## Related\n- [[A]]\n";
    const { content, added } = ensureSection(original, "Related");
    assert.equal(added, false);
    assert.equal(content, original);
});

test("ensureSection: trims trailing blank lines before heading", () => {
    const { content } = ensureSection("Some content\n\n\n", "Related");
    assert.equal(content, "Some content\n\n## Related\n");
});

test("addRelated: appends new Related section to plain note", () => {
    const { content, added } = addRelated("Some content", "Home");
    assert.equal(added, true);
    assert.equal(content, "Some content\n\n## Related\n- [[Home]]\n");
});

test("addRelated: appends to existing Related section", () => {
    const original = "## Related\n- [[A]]\n\n## Other\n";
    const { content, added } = addRelated(original, "Home");
    assert.equal(added, true);
    assert.equal(content, "## Related\n- [[A]]\n- [[Home]]\n\n## Other\n");
});

test("addRelated: adds to empty Related section", () => {
    const original = "## Related\n";
    const { content, added } = addRelated(original, "Home");
    assert.equal(added, true);
    assert.equal(content, "## Related\n- [[Home]]\n");
});

test("addRelated: refuses duplicate case-insensitively", () => {
    const original = "## Related\n- [[Home]]\n";
    const { content, added } = addRelated(original, "home.md");
    assert.equal(added, false);
    assert.equal(content, original);
});

test("addRelated: keeps CRLF line endings", () => {
    const original = "Some content\r\n";
    const { content } = addRelated(original, "Home");
    assert.equal(content, "Some content\r\n\r\n## Related\r\n- [[Home]]\r\n");
    assert.equal(detectNewline(content), "\r\n");
});

test("removeRelated: removes matching bullet", () => {
    const original = "## Related\n- [[A]]\n- [[Home]]\n\n## Other\n";
    const { content, removed } = removeRelated(original, "home");
    assert.equal(removed, true);
    assert.equal(content, "## Related\n- [[A]]\n\n## Other\n");
});

test("removeRelated: only removes inside Related section", () => {
    const original = "## Related\n- [[A]]\n\n## Notes\n- [[Home]]\n";
    const { content, removed } = removeRelated(original, "Home");
    assert.equal(removed, false);
    assert.equal(content, original);
});

test("removeRelated: reports not found", () => {
    const original = "## Related\n- [[A]]\n";
    const { content, removed } = removeRelated(original, "Home");
    assert.equal(removed, false);
    assert.equal(content, original);
});

test("RELATED_HEADING is exported", () => {
    assert.equal(RELATED_HEADING, "Related");
});
