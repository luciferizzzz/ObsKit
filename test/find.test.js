const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROMPTS_PATH = require.resolve("@inquirer/prompts");
const originalPrompts = require(PROMPTS_PATH);

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
    assert.ok(output.includes("Notes/Cargo.md"));
    assert.ok(!output.includes("Cargo.txt"));
});

test("find: type filter restricts extensions", async () => {
    const root = makeVault();
    const md = await withVault(root, () =>
        capture(() => find("cargo", { type: "md" }))
    );
    assert.ok(md.includes("Notes/Cargo.md"));
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

// ─── `-n, --limit` flag ───────────────────────────────────────────────

const bin = path.join(__dirname, "..", "bin", "obs.js");

function runCli(args, root) {
    return spawnSync(process.execPath, [bin, ...args], {
        encoding: "utf8",
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, OBSKIT_VAULT: root },
    });
}

async function captureAsync(fn) {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.map(String).join(" "));
    try {
        await fn();
    } finally {
        console.log = original;
    }
    return logs.join("\n");
}

// Loads commands/find.js fresh so it binds to the stubbed `select` — the
// same require.cache-stubbing convention used by
// test/interactiveDispatch.test.js. Prompts are restored immediately after
// because find destructures `select` at module load.
function loadFindWithSelect(select) {
    const prompts = require(PROMPTS_PATH);
    require.cache[PROMPTS_PATH].exports = { ...prompts, select };
    delete require.cache[require.resolve("../commands/find")];
    try {
        return require("../commands/find");
    } finally {
        require.cache[PROMPTS_PATH].exports = prompts;
    }
}

function restoreFindModule() {
    require.cache[PROMPTS_PATH].exports = originalPrompts;
    delete require.cache[require.resolve("../commands/find")];
}

function makeWideVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-find-wide-"));
    fs.writeFileSync(path.join(root, "Rust Alpha.md"), "# alpha\n");
    fs.writeFileSync(path.join(root, "Rust Beta.md"), "# beta\n");
    fs.writeFileSync(path.join(root, "Rust Gamma.md"), "# gamma\n");
    fs.writeFileSync(path.join(root, "Rust Delta.md"), "# delta\n");
    return root;
}

test("find: limit caps displayed results to the top-ranked match", async () => {
    const root = makeVault();
    const output = await withVault(root, () =>
        capture(() => find("rust", { limit: 1 }))
    );
    assert.ok(output.includes("Ditemukan 1 note"));
    assert.ok(output.includes("Rust.md"));
    assert.ok(!output.includes("Learning Rust.md"));
});

test("find: omitted limit keeps unlimited output", async () => {
    const root = makeVault();
    const output = await withVault(root, () =>
        capture(() => find("rust", { limit: undefined }))
    );
    assert.ok(output.includes("Ditemukan 2 note"));
    assert.ok(output.includes("Learning Rust.md"));
    assert.ok(output.includes("Rust.md"));
});

test("find: limit caps content-mode results", async () => {
    const root = makeVault();
    const output = await withVault(root, () =>
        capture(() => find("cargo", { content: true, limit: 1 }))
    );
    assert.ok(output.includes("Ditemukan 1 note"));
    assert.ok(output.includes("Notes/Cargo.md"));
    assert.ok(!output.includes("Learning Rust.md"));
});

test("find: limit caps fuzzy-mode results", async () => {
    const root = makeVault();
    const output = await withVault(root, () =>
        capture(() => find("rust", { fuzzy: true, limit: 1 }))
    );
    assert.ok(output.includes("Ditemukan 1 note"));
    assert.ok(output.includes("Rust.md"));
    assert.ok(!output.includes("Learning Rust.md"));
});

test("find: numeric string limit (the CLI flag value) is accepted", async () => {
    const root = makeVault();
    const output = await withVault(root, () =>
        capture(() => find("rust", { limit: "1" }))
    );
    assert.ok(output.includes("Ditemukan 1 note"));
    assert.ok(!output.includes("Learning Rust.md"));
});

test("find: invalid limit values report an Indonesian error", async () => {
    const root = makeVault();
    const invalidValues = [
        0,
        -1,
        1.5,
        NaN,
        "abc",
        "0",
        "-2",
        "2.5",
        "",
        "   ",
        null,
        true,
        {},
    ];
    for (const value of invalidValues) {
        const output = await withVault(root, () =>
            capture(() => find("rust", { limit: value }))
        );
        assert.ok(
            output.includes("Nilai --limit tidak valid"),
            `expected an error for limit=${JSON.stringify(value)}, got: ${output}`
        );
        assert.ok(!output.includes("Ditemukan"));
        assert.ok(!output.includes("Tidak ada note"));
    }
});

test("find: --pick with limit 1 skips the picker and prints the top result", async () => {
    const root = makeVault();
    const output = await withVault(root, () =>
        capture(() => find("rust", { pick: true, limit: 1 }))
    );
    assert.ok(output.includes("Ditemukan 1 note"));
    assert.ok(output.includes("Rust.md"));
    assert.ok(!output.includes("Learning Rust.md"));
});

test("find: --pick without a limit still offers every result", async () => {
    const root = makeWideVault();
    const seen = [];
    const stubbed = loadFindWithSelect(async ({ choices }) => {
        seen.push(choices.map((choice) => choice.value.relativePath));
        return choices[0].value;
    });
    try {
        const output = await withVault(root, () =>
            captureAsync(() => stubbed("rust", { pick: true }))
        );
        assert.equal(seen.length, 1);
        assert.equal(seen[0].length, 4);
        assert.ok(output.includes(seen[0][0]));
    } finally {
        restoreFindModule();
    }
});

test("find: --pick offers only the limited top results", async () => {
    const root = makeWideVault();
    const seen = [];
    const stubbed = loadFindWithSelect(async ({ choices }) => {
        seen.push(choices.map((choice) => choice.value.relativePath));
        return choices[0].value;
    });
    try {
        const output = await withVault(root, () =>
            captureAsync(() => stubbed("rust", { pick: true, limit: 2 }))
        );
        assert.equal(seen.length, 1);
        assert.equal(seen[0].length, 2);
        // Only the two picked results are listed/printed — the limit was
        // applied before the picker opened.
        assert.ok(!output.includes("Rust Gamma.md"));
        assert.ok(!output.includes("Rust Delta.md"));
        assert.ok(output.includes(seen[0][0]));
    } finally {
        restoreFindModule();
    }
});

test("cli: find --limit caps the printed output", () => {
    const root = makeVault();
    const { status, stdout } = runCli(["find", "rust", "--limit", "1"], root);
    assert.equal(status, 0);
    assert.ok(stdout.includes("Ditemukan 1 note"));
    assert.ok(!stdout.includes("Learning Rust.md"));
});

test("cli: find -n is the short form of --limit", () => {
    const root = makeVault();
    const { status, stdout } = runCli(["find", "rust", "-n", "1"], root);
    assert.equal(status, 0);
    assert.ok(stdout.includes("Ditemukan 1 note"));
});

test("cli: find --limit accepts a valid value and stays unlimited without it", () => {
    const root = makeVault();
    const unlimited = runCli(["find", "rust"], root);
    assert.equal(unlimited.status, 0);
    assert.ok(unlimited.stdout.includes("Ditemukan 2 note"));
});

test("cli: find --limit rejects non-numeric values with an Indonesian error", () => {
    const root = makeVault();
    const { status, stdout } = runCli(["find", "rust", "--limit", "abc"], root);
    assert.equal(status, 0);
    assert.ok(stdout.includes("Nilai --limit tidak valid"));
    assert.ok(!stdout.includes("Ditemukan"));
});

test("cli: find --limit rejects zero with an Indonesian error", () => {
    const root = makeVault();
    const { status, stdout } = runCli(["find", "rust", "--limit", "0"], root);
    assert.equal(status, 0);
    assert.ok(stdout.includes("Nilai --limit tidak valid"));
    assert.ok(!stdout.includes("Ditemukan"));
});

test("cli: find --help documents the limit flag", () => {
    const root = makeVault();
    const { status, stdout } = runCli(["find", "--help"], root);
    assert.equal(status, 0);
    assert.ok(stdout.includes("--limit"));
});
