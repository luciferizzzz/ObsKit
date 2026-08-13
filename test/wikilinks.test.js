const { test } = require("node:test");
const assert = require("node:assert/strict");

const { extractWikiLinks } = require("../utils/wikilinks");

test("extractWikiLinks: keeps legacy behavior", () => {
    const content = "[[Page]] [[Folder/Page]] [[Page|Alias]] [[Page#Heading]] [[image.png]] [[Page#Heading|Custom]]";
    assert.deepEqual(extractWikiLinks(content), [
        "Page",
        "Page",
        "Page",
        "Page#Heading",
        "Page#Heading",
    ]);
});

test("extractWikiLinks: empty content", () => {
    assert.deepEqual(extractWikiLinks(""), []);
});
