// Direct tests for commands/open.js.
//
// Phase 2 (Search Foundation v2) replaced open.js's duplicated traversal and
// matching logic with utils/search.js `searchFiles()`, while preserving the
// command's established behavior:
//   - matches every file name, all extensions (no configured exclusions),
//   - descends into hidden folders like before,
//   - lists results in the filesystem (readdir depth-first) traversal order,
//   - opens a single result through the existing `exec` mechanism,
//   - lists multiple results numbered, without opening anything,
//   - reports "Note tidak ditemukan." when nothing matches,
//   - displays normalized relative paths with `/` separators.
//
// Mocking conventions: `exec` is captured from child_process at module load
// time, so the stub is installed in require.cache BEFORE commands/open.js is
// first required — the same require.cache-stubbing convention used by
// test/interactiveDispatch.test.js. No dependency is added for this; core
// modules are not cached by Node, so the placeholder entry is inserted by
// hand and removed again afterwards.

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CHILD_PROCESS = require.resolve("child_process");
const OPEN_PATH = require.resolve("../commands/open");

const execCalls = [];

require.cache[CHILD_PROCESS] = {
    id: CHILD_PROCESS,
    filename: CHILD_PROCESS,
    loaded: true,
    exports: {
        exec: (cmd) => execCalls.push(cmd),
    },
};

const open = require("../commands/open");

after(() => {
    delete require.cache[CHILD_PROCESS];
    delete require.cache[OPEN_PATH];
});

function makeVault(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-open-"));
    for (const [name, content] of Object.entries(files)) {
        const full = path.join(root, name);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }
    return root;
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

// Independent depth-first readdir oracle, mirroring the traversal contract
// directly from fs. Any sort introduced into the listing shows up as a
// mismatch.
function traversalOrder(root) {
    const out = [];
    (function walk(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else out.push(full);
        }
    })(root);
    return out;
}

function normalize(relative) {
    return relative.split(path.sep).join("/");
}

function listedPaths(output) {
    return output
        .split("\n")
        .map((line) => line.match(/^\d+\. (.+)$/))
        .filter(Boolean)
        .map((match) => match[1]);
}

test("open: opens a single result through the exec mechanism", () => {
    const root = makeVault({ "Only Note.md": "# only\n" });
    execCalls.length = 0;

    const output = withVault(root, () => capture(() => open("ONLY NOTE")));

    assert.equal(execCalls.length, 1);
    assert.equal(
        execCalls[0],
        `start "" "${path.join(root, "Only Note.md")}"`
    );
    assert.ok(output.includes("Membuka note..."));
});

test("open: lists multiple results numbered without opening anything", () => {
    const root = makeVault({
        "Alpha Rust.md": "# alpha\n",
        "Beta Rust.txt": "rust data\n",
        "Notes/Gamma Rust.md": "# gamma\n",
        "Cargo.md": "# no match\n",
    });
    execCalls.length = 0;

    const output = withVault(root, () => capture(() => open("rust")));

    assert.equal(execCalls.length, 0);
    assert.ok(output.includes("Ditemukan beberapa note:"));

    const listed = listedPaths(output);
    // All extensions are searched, and the listing follows the filesystem
    // traversal order (no sorting).
    const expected = traversalOrder(root)
        .map((file) => normalize(path.relative(root, file)))
        .filter((relative) => path.basename(relative).toLowerCase().includes("rust"));
    assert.deepEqual(listed, expected);
    assert.equal(listed.length, 3);
    assert.ok(listed.some((p) => p.endsWith("Beta Rust.txt")));
});

test("open: reports an error when nothing matches", () => {
    const root = makeVault({ "Alpha.md": "# alpha\n" });
    execCalls.length = 0;

    const output = withVault(root, () => capture(() => open("zzz")));

    assert.equal(execCalls.length, 0);
    assert.ok(output.includes("Note tidak ditemukan."));
    assert.ok(!output.includes("Membuka note"));
});

test("open: hidden folders are still searched", () => {
    const root = makeVault({
        "Visible.md": "# visible\n",
        ".private/Secret Rust.md": "# secret\n",
    });
    execCalls.length = 0;

    const output = withVault(root, () => capture(() => open("secret rust")));

    assert.equal(execCalls.length, 1);
    assert.equal(
        execCalls[0],
        `start "" "${path.join(root, ".private", "Secret Rust.md")}"`
    );
    assert.ok(output.includes("Membuka note..."));
});

test("open: displayed relative paths use forward slashes", () => {
    const root = makeVault({
        "Notes/Sub/Deep Rust.md": "# deep\n",
        "Top Rust.md": "# top\n",
    });
    execCalls.length = 0;

    const output = withVault(root, () => capture(() => open("rust")));

    assert.equal(execCalls.length, 0);
    assert.ok(output.includes("Notes/Sub/Deep Rust.md"));
    assert.ok(
        !output.includes("Notes\\Sub"),
        `expected normalized forward-slash paths, got: ${output}`
    );
});

test("open: listing order matches the readdir traversal order (no sorting)", () => {
    const root = makeVault({
        "Rust Zulu.md": "# zulu\n",
        "rust apple.md": "# apple\n",
        "Rust Banana.md": "# banana\n",
        "Notes/Rust Nested.md": "# nested\n",
    });
    execCalls.length = 0;

    const output = withVault(root, () => capture(() => open("rust")));

    assert.equal(execCalls.length, 0);
    const listed = listedPaths(output);
    const expected = traversalOrder(root)
        .map((file) => normalize(path.relative(root, file)))
        .filter((relative) => path.basename(relative).toLowerCase().includes("rust"));
    assert.deepEqual(listed, expected);

    // Fixture sanity: the expected order must differ from a lexicographic
    // sort, otherwise this test could not detect an introduced sort.
    assert.notDeepEqual(
        listed,
        [...listed].sort(),
        "fixture must distinguish traversal order from sorted order"
    );
});
