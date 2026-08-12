const { test } = require("node:test");
const assert = require("node:assert/strict");

const { SYMBOLS, success, info, warning, error } = require("../utils/feedback");

function capture(fn) {
    const original = console.log;
    const lines = [];
    console.log = (...args) => lines.push(args.join(" "));
    try {
        fn();
    } finally {
        console.log = original;
    }
    return lines;
}

test("SYMBOLS: exposes all four feedback categories", () => {
    assert.ok(SYMBOLS.success);
    assert.ok(SYMBOLS.info);
    assert.ok(SYMBOLS.warning);
    assert.ok(SYMBOLS.error);
});

test("success: prints ✅ symbol with the message", () => {
    const lines = capture(() => success("Note created: Example.md"));
    assert.equal(lines.length, 1);
    assert.match(lines[0], new RegExp(SYMBOLS.success));
    assert.match(lines[0], /Note created: Example\.md/);
});

test("success: no ANSI colors when not a TTY", () => {
    const lines = capture(() => success("Clean output"));
    assert.equal(lines[0], `${SYMBOLS.success}Clean output`);
});

test("error: prints ❌ symbol with the message", () => {
    const lines = capture(() => error("Note not found: Example.md"));
    assert.equal(lines.length, 1);
    assert.match(lines[0], new RegExp(SYMBOLS.error));
    assert.match(lines[0], /Note not found: Example\.md/);
});

test("warning: prints ⚠ symbol with the message", () => {
    const lines = capture(() => warning("Note already exists: Example.md"));
    assert.equal(lines.length, 1);
    assert.match(lines[0], new RegExp(SYMBOLS.warning));
    assert.match(lines[0], /Note already exists: Example\.md/);
});

test("info: prints ℹ symbol with the message", () => {
    const lines = capture(() => info("No backlinks found."));
    assert.equal(lines.length, 1);
    assert.match(lines[0], new RegExp(SYMBOLS.info));
    assert.match(lines[0], /No backlinks found\./);
});

test("feedback: each category uses a distinct symbol", () => {
    const symbols = [SYMBOLS.success, SYMBOLS.info, SYMBOLS.warning, SYMBOLS.error];
    assert.equal(new Set(symbols).size, 4);
});

test("feedback: messages are passed through unchanged", () => {
    const message = "Relationship added: A → B";
    const lines = capture(() => success(message));
    assert.match(lines[0], /Relationship added: A → B/);
});
