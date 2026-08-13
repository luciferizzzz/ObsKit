const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const find = require("../commands/find");

function makeVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-find-cmd-"));
    fs.mkdirSync(path.join(root, "Notes"), { recursive: true });
    fs.writeFileSync(
        path.join(root, "Learning Rust.md"),
        "# Rust\nRust and cargo are awesome.\n"
    );
    fs.writeFileSync(path.join(root, "Rust.md"), "# Rust\n");
    fs.writeFileSync(
        path.join(root, "Notes", "Cargo.md"),
        "# Cargo\ncargo is here\n"
    );
    fs.writeFileSync(path.join(root, "Cargo.txt"), "cargo\n");
    return root;
}

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

test("find: matches filenames by default and ranks results", async () => {
    const root = makeVault();
    const output = await withVault(root, () =>
        capture(() => find("rust"))
    );
    assert.ok(output.includes("Ditemukan 2 note"));
    assert.ok(output.includes("Learning Rust.md"));
    assert.ok(output.includes("Rust.md"));
});

test("find: fuzzy mode matches typo-tolerant queries", async () => {
    const root = makeVault();
    const output = await withVault(root, () =>
        capture(() => find("lrning rust", { fuzzy: true }))
    );
    assert.ok(output.includes("Learning Rust.md"));
});

test("find: content mode searches inside notes", async () => {
    const root = makeVault();
    const output = await withVault(root, () =>
        capture(() => find("cargo", { content: true }))
    );
    assert.ok(output.includes("Learning Rust.md"));
    assert.ok(output.includes(path.join("Notes", "Cargo.md")));
    assert.ok(!output.includes("Cargo.txt"));
});

test("find: type filter restricts extensions", async () => {
    const root = makeVault();
    const md = await withVault(root, () =>
        capture(() => find("cargo", { type: "md" }))
    );
    assert.ok(md.includes(path.join("Notes", "Cargo.md")));
    assert.ok(!md.includes("Cargo.txt"));

    const txt = await withVault(root, () =>
        capture(() => find("cargo", { type: "txt" }))
    );
    assert.ok(txt.includes("Cargo.txt"));
});

test("find: folder filter restricts the search root", async () => {
    const root = makeVault();
    const output = await withVault(root, () =>
        capture(() => find("cargo", { folder: "Notes" }))
    );
    assert.ok(output.includes("Cargo.md"));
    assert.ok(!output.includes("Learning Rust.md"));
});

test("find: missing folder reports an error", async () => {
    const root = makeVault();
    const output = await withVault(root, () =>
        capture(() => find("rust", { folder: "Nope" }))
    );
    assert.ok(output.includes("Folder tidak ditemukan"));
});

test("find: no results reports nothing found", async () => {
    const root = makeVault();
    const output = await withVault(root, () =>
        capture(() => find("zzz"))
    );
    assert.ok(output.includes("Tidak ada note yang ditemukan"));
});
