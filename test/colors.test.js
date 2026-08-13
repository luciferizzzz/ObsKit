const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { default: chalk } = require("chalk");

const {
    ANSI_RE,
    stripAnsi,
    heading,
    title,
    note,
    path,
    folder,
    value,
    dim,
    divider,
    tag,
} = require("../utils/colors");

let previousLevel;

beforeEach(() => {
    previousLevel = chalk.level;
    chalk.level = 1;
});

afterEach(() => {
    chalk.level = previousLevel;
});

test("stripAnsi: removes ANSI escape sequences", () => {
    assert.equal(stripAnsi("\u001B[36mcyan\u001B[39m"), "cyan");
    assert.equal(stripAnsi("plain"), "plain");
});

test("heading: bold cyan text", () => {
    const out = heading("Vault Tree");
    assert.match(out, /\u001B\[1m\u001B\[36mVault Tree\u001B\[39m\u001B\[22m/);
});

test("colors: all helpers return the input text when colors are disabled", () => {
    chalk.level = 0;
    assert.equal(heading("x"), "x");
    assert.equal(title("x"), "x");
    assert.equal(note("x"), "x");
    assert.equal(path("x"), "x");
    assert.equal(folder("x"), "x");
    assert.equal(value("x"), "x");
    assert.equal(dim("x"), "x");
    assert.equal(divider("x"), "x");
    assert.equal(tag("x"), "x");
});

test("colors: helpers wrap text in ANSI codes", () => {
    assert.match(title("T"), /\u001B\[1m/);
    assert.match(note("N"), /\u001B\[36m/);
    assert.match(path("P"), /\u001B\[36m/);
    assert.match(folder("F"), /\u001B\[35m/);
    assert.match(value("V"), /\u001B\[33m/);
    assert.match(dim("D"), /\u001B\[90m/);
    assert.match(tag("Tg"), /\u001B\[32m/);
});

test("colors: stripped output equals the original text", () => {
    assert.equal(stripAnsi(heading("H")), "H");
    assert.equal(stripAnsi(value("42")), "42");
    assert.equal(stripAnsi(note("a/b.md")), "a/b.md");
});

test("ANSI_RE: exported regex matches escape sequences", () => {
    assert.ok(ANSI_RE.test("\u001B[1m"));
    assert.ok(!ANSI_RE.test("plain"));
});
