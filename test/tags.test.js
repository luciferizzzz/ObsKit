const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tags = require("../commands/tags");
const {
    normalizeTagQuery,
    extractTags,
    findNotesByTag,
} = require("../commands/tags");

function makeVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-tags-cmd-"));
    return root;
}

function write(root, relativePath, content) {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
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

function makeTaggedVault() {
    const root = makeVault();
    write(
        root,
        path.join("Notes", "Programming.md"),
        "# Programming\n\nLearning #rust today.\nAlso #javascript.\n"
    );
    write(
        root,
        path.join("Projects", "Rust.md"),
        "# Rust Project\n\n#rust #systems\n"
    );
    write(
        root,
        path.join("Daily Notes", "2026-08-20.md"),
        "# Daily\n\nStudied #rust again.\n"
    );
    write(root, path.join("Notes", "Rustlang.md"), "#rustlang is a different tag\n");
    write(root, path.join("Notes", "Rust Web.md"), "#rust-web and #web notes\n");
    return root;
}

test("tags: no argument keeps existing count behavior", () => {
    const root = makeTaggedVault();
    const output = withVault(root, () => capture(() => tags()));

    assert.ok(output.includes("Tags"));
    assert.ok(output.includes("#rust"));
    assert.ok(output.includes("(3)"));
    assert.ok(output.includes("#rustlang"));
    assert.ok(output.includes("#rust-web"));
    assert.ok(output.includes("#javascript"));
    assert.ok(output.includes("Total Tags"));
    assert.ok(output.includes("Unique Tags"));
});

test("tags: lookup by plain name lists matching notes", () => {
    const root = makeTaggedVault();
    const output = withVault(root, () => capture(() => tags("rust")));

    assert.ok(output.includes("#rust"));
    assert.ok(!output.includes("#rustlang"));
    assert.ok(!output.includes("#rust-web"));
});

test("tags: lookup with # prefix resolves to the same tag", () => {
    const root = makeTaggedVault();
    const withHash = withVault(root, () => capture(() => tags("#rust")));
    const withoutHash = withVault(root, () => capture(() => tags("rust")));

    assert.equal(withHash, withoutHash);
});

test("tags: matching is case-insensitive", () => {
    const root = makeTaggedVault();
    const output = withVault(root, () => capture(() => tags("#RuSt")));

    assert.ok(output.includes("Total Notes"));
});

test("tags: exact match does not match longer tags", () => {
    const root = makeTaggedVault();

    const rust = withVault(root, () => capture(() => tags("rust")));
    assert.ok(rust.includes("Total Notes : 3"));
    assert.ok(rust.includes("Total Notes : 3") && !rust.includes("Rustlang.md"));

    const rustlang = withVault(root, () => capture(() => tags("rustlang")));
    assert.ok(rustlang.includes("Rustlang.md"));
    assert.ok(!rustlang.includes("Programming.md"));

    const rustWeb = withVault(root, () => capture(() => tags("rust-web")));
    assert.ok(rustWeb.includes("Rust Web.md"));
});

test("tags: longer tags are found when explicitly requested", () => {
    const root = makeTaggedVault();
    const output = withVault(root, () => capture(() => tags("#rust-web")));

    assert.ok(output.includes("Rust Web.md"));
    assert.ok(output.includes("Total Notes : 1"));
});

test("tags: tags inside code fences are ignored", () => {
    const root = makeVault();
    write(
        root,
        path.join("Notes", "Snippet.md"),
        [
            "# Snippet",
            "",
            "```markdown",
            "#not-a-tag-in-code",
            "```",
            "",
            "`#also-inline`",
            "",
            "Real #tagged note.",
            "",
        ].join("\n")
    );

    const output = withVault(root, () => capture(() => tags("not-a-tag-in-code")));
    assert.ok(output.includes("No notes found."));

    const real = withVault(root, () => capture(() => tags("tagged")));
    assert.ok(real.includes("Snippet.md"));
});

test("tags: a note is listed once even when tagged multiple times", () => {
    const root = makeVault();
    write(
        root,
        path.join("Notes", "Repeat.md"),
        "#rust start\nmiddle #rust again\nend #rust\n"
    );

    const output = withVault(root, () => capture(() => tags("rust")));
    assert.ok(output.includes("Repeat.md"));
    assert.ok(output.includes("Total Notes : 1"));
});

test("tags: multiple matching notes are listed with a total", () => {
    const root = makeTaggedVault();
    const output = withVault(root, () => capture(() => tags("rust")));

    assert.ok(output.includes("Programming.md"));
    assert.ok(output.includes("Rust.md"));
    assert.ok(output.includes("2026-08-20.md"));
    assert.ok(output.includes("Total Notes : 3"));
});

test("tags: unknown tag reports no notes without failing", () => {
    const root = makeTaggedVault();
    let didNotThrow = true;
    const output = withVault(root, () =>
        capture(() => {
            try {
                tags("does-not-exist");
            } catch (err) {
                didNotThrow = false;
            }
        })
    );

    assert.ok(didNotThrow);
    assert.ok(output.includes("does-not-exist"));
    assert.ok(output.includes("No notes found."));
});

test("tags: nested folders are listed with forward slashes", () => {
    const root = makeVault();
    write(
        root,
        path.join("Projects", "Web", "Client", "Deep Note.md"),
        "deeply nested #rust note\n"
    );

    const output = withVault(root, () => capture(() => tags("rust")));
    assert.ok(output.includes("Projects/Web/Client/Deep Note.md"));
});

test("tags: unicode filenames are supported", () => {
    const root = makeVault();
    write(
        root,
        path.join("Catatan", "Pemrograman Rust.md"),
        "unicode filename #rust\n"
    );

    const output = withVault(root, () => capture(() => tags("rust")));
    assert.ok(output.includes("Catatan/Pemrograman Rust.md"));
});

test("tags: emoji filenames are supported", () => {
    const root = makeVault();
    write(
        root,
        path.join("Fun", "🚀 Rocket Science.md"),
        "emoji filename #rust\n"
    );

    const output = withVault(root, () => capture(() => tags("rust")));
    assert.ok(output.includes("Fun/🚀 Rocket Science.md"));
});

test("tags: CRLF files are scanned correctly", () => {
    const root = makeVault();
    write(
        root,
        path.join("Notes", "Windows Note.md"),
        "# Windows\r\n\r\nCRLF content #rust here.\r\n"
    );

    const output = withVault(root, () => capture(() => tags("rust")));
    assert.ok(output.includes("Windows Note.md"));
    assert.ok(output.includes("Total Notes : 1"));
});

test("tags: LF files are scanned correctly", () => {
    const root = makeVault();
    write(
        root,
        path.join("Notes", "Unix Note.md"),
        "# Unix\n\nLF content #rust here.\n"
    );

    const output = withVault(root, () => capture(() => tags("rust")));
    assert.ok(output.includes("Unix Note.md"));
    assert.ok(output.includes("Total Notes : 1"));
});

test("normalizeTagQuery: trims, strips hashes, lowercases", () => {
    assert.equal(normalizeTagQuery("rust"), "rust");
    assert.equal(normalizeTagQuery("#rust"), "rust");
    assert.equal(normalizeTagQuery("  #Rust  "), "rust");
    assert.equal(normalizeTagQuery("##nested"), "nested");
    assert.equal(normalizeTagQuery("rust/lang"), "rust/lang");
    assert.equal(normalizeTagQuery(""), "");
    assert.equal(normalizeTagQuery(undefined), "");
});

test("extractTags: reused extraction ignores code blocks and keeps exact tokens", () => {
    const content = [
        "text #rust more",
        "```js",
        "// #ignored",
        "```",
        "inline `#nope` code",
        "#rust-lang stays separate",
        "#rust/web nested ok",
    ].join("\n");

    assert.deepEqual(extractTags(content), ["#rust", "#rust-lang", "#rust/web"]);
});

test("findNotesByTag: empty query resolves nothing", () => {
    const root = makeTaggedVault();
    const result = withVault(root, () => {
        const { scanMarkdownFiles } = require("../utils/scanner");
        const files = scanMarkdownFiles(root);
        return findNotesByTag(root, files, "");
    });

    assert.deepEqual(result.notes, []);
});
