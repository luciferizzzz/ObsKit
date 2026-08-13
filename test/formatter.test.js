const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    dedupeLinks,
    formatLinkList,
    formatRelations,
    formatAddResult,
    formatRemoveResult,
    formatSelfReferenceResult,
} = require("../utils/relationship/formatter");

test("dedupeLinks: removes duplicates by normalized target", () => {
    const links = [{ target: "Home" }, { target: "home.md" }, { target: "Rust" }];
    const result = dedupeLinks(links);
    assert.equal(result.length, 2);
    assert.equal(result[0].target, "Home");
});

test("formatLinkList: renders wiki link bullets", () => {
    const lines = formatLinkList(["Home", { target: "Rust" }]);
    assert.deepEqual(lines, ["- [[Home]]", "- [[Rust]]"]);
});

test("formatRelations: full output", () => {
    const output = formatRelations({
        note: "Home",
        related: [{ target: "Rust" }],
        backlinks: ["Note A"],
        outgoing: [{ target: "Go" }, { target: "Go" }],
    });
    assert.match(output, /Relations for "Home"/);
    assert.match(output, /Related/);
    assert.match(output, /- \[\[Rust\]\]/);
    assert.match(output, /Backlinks/);
    assert.match(output, /- Note A/);
    assert.match(output, /Outgoing Links/);
    assert.ok((output.match(/\[\[Go\]\]/g) || []).length === 1);
});

test("formatRelations: empty output", () => {
    const output = formatRelations({ note: "Home", related: [], backlinks: [], outgoing: [] });
    assert.match(output, /No relationships found\./);
});

test("formatAddResult: added vs already related", () => {
    assert.match(formatAddResult("Home", "Rust", true), /Related added\./);
    assert.match(formatAddResult("Home", "Rust", false), /Already related\./);
});

test("formatRemoveResult: removed vs not related", () => {
    assert.match(formatRemoveResult("Home", "Rust", true), /Related removed\./);
    assert.match(formatRemoveResult("Home", "Rust", false), /Not related\./);
});

test("formatSelfReferenceResult: warns against self-relation", () => {
    assert.match(formatSelfReferenceResult("Home"), /Cannot relate a note to itself\./);
    assert.match(formatSelfReferenceResult("Home"), /Home → Home/);
});
