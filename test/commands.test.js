const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const orphan = require("../commands/orphan");
const graph = require("../commands/graph");
const deadlinks = require("../commands/deadlinks");
const backlinks = require("../commands/backlinks");

function withVault(root, fn) {
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    try {
        return fn();
    } finally {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    }
}

function capture(fn) {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.map(String).join(" "));
    try {
        fn();
    } finally {
        console.log = original;
    }
    return logs.join("\n");
}

test("orphan: lists notes with no incoming links", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-orphan-"));
    fs.writeFileSync(
        path.join(root, "Home.md"),
        "[[Rust]]\n[[Note A]]\n[[Missing]]\n"
    );
    fs.writeFileSync(path.join(root, "Rust.md"), "[[home]]\n");
    fs.writeFileSync(path.join(root, "Note A.md"), "plain\n");
    fs.mkdirSync(path.join(root, "Sub"), { recursive: true });
    fs.writeFileSync(path.join(root, "Sub", "Nested.md"), "no links\n");

    const output = withVault(root, () => capture(() => orphan()));
    assert.ok(output.includes("Sub/Nested.md"));
    assert.ok(!output.includes("Home.md"));
    assert.ok(!output.includes("Rust.md"));
    assert.ok(output.includes("Total Orphan Notes"));
});

test("orphan: reports none when every note is referenced", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-orphan-"));
    fs.writeFileSync(path.join(root, "Home.md"), "[[Rust]]\n");
    fs.writeFileSync(path.join(root, "Rust.md"), "[[home]]\n");

    const output = withVault(root, () => capture(() => orphan()));
    assert.ok(output.includes("No orphan notes found."));
});

test("graph: computes links, broken, and orphan counts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-graph-"));
    fs.writeFileSync(
        path.join(root, "Home.md"),
        "[[Rust]]\n[[Note A]]\n[[Missing]]\n"
    );
    fs.writeFileSync(path.join(root, "Rust.md"), "[[home]]\n");
    fs.writeFileSync(path.join(root, "Note A.md"), "");
    fs.writeFileSync(path.join(root, "Lonely.md"), "");

    const output = withVault(root, () => capture(() => graph()));
    assert.ok(output.includes("Notes          : 4"));
    assert.ok(output.includes("Wiki Links     : 4"));
    assert.ok(output.includes("Broken Links   : 1"));
    assert.ok(output.includes("Orphan Notes   : 1"));
});

test("deadlinks: reports broken links with counts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dead-"));
    fs.writeFileSync(path.join(root, "Home.md"), "[[Rust]]\n[[Ghost]]\n");
    fs.writeFileSync(path.join(root, "Rust.md"), "[[home]]\n");

    const output = withVault(root, () => capture(() => deadlinks()));
    assert.ok(output.includes("[[Ghost]]"));
    assert.ok(!output.includes("[[Rust]]"));
    assert.ok(output.includes("Broken Links"));
});

test("deadlinks: reports none when all links resolve", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dead-"));
    fs.writeFileSync(path.join(root, "Home.md"), "[[Rust]]\n");
    fs.writeFileSync(path.join(root, "Rust.md"), "[[home]]\n");

    const output = withVault(root, () => capture(() => deadlinks()));
    assert.ok(output.includes("Tidak ada broken links."));
});

test("backlinks: finds all notes referencing a target", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-back-"));
    fs.writeFileSync(path.join(root, "Home.md"), "[[Rust]]\n");
    fs.writeFileSync(path.join(root, "Rust.md"), "[[home]]\n");
    fs.mkdirSync(path.join(root, "Sub"), { recursive: true });
    fs.writeFileSync(path.join(root, "Sub", "Note.md"), "[[rust]]\n");

    const output = withVault(root, () => capture(() => backlinks("Rust")));
    assert.ok(output.includes("Home.md"));
    assert.ok(output.includes("Sub/Note.md"));
    assert.ok(output.includes("Total Backlinks: 2"));
});
