const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const info = require("../commands/info");

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

function makeVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-info-"));
    return root;
}

test("info: shows basic metadata for a normal note", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Rust.md"),
        "# Rust\n\nRust is a systems language.\n\n## Features\n\n- Memory safety\n- Zero-cost abstractions\n"
    );
    const output = withVault(root, () => capture(() => info("Rust")));
    assert.ok(output.includes("Note Information"));
    assert.ok(output.includes("Name"));
    assert.ok(output.includes("Rust"));
    assert.ok(output.includes("Path"));
    assert.ok(output.includes("Rust.md"));
    assert.ok(output.includes("Size"));
    assert.ok(output.includes("Words"));
    assert.ok(output.includes("Created"));
    assert.ok(output.includes("Modified"));
});

test("info: resolves note without .md extension", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Alice.md"), "# Alice\nHello\n");
    const output = withVault(root, () => capture(() => info("Alice")));
    assert.ok(output.includes("Alice"));
    assert.ok(output.includes("Alice.md"));
});

test("info: resolves note in nested folder", () => {
    const root = makeVault();
    fs.mkdirSync(path.join(root, "People"), { recursive: true });
    fs.writeFileSync(path.join(root, "People", "Bob.md"), "# Bob\nHi\n");
    const output = withVault(root, () => capture(() => info("Bob")));
    assert.ok(output.includes("Bob"));
    assert.ok(output.includes("People/Bob.md"));
});

test("info: handles filename with spaces", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "My Note.md"), "# My Note\nContent\n");
    const output = withVault(root, () => capture(() => info("My Note")));
    assert.ok(output.includes("My Note"));
    assert.ok(output.includes("My Note.md"));
});

test("info: handles Unicode filename", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "笔记.md"), "# 笔记\nUnicode content\n");
    const output = withVault(root, () => capture(() => info("笔记")));
    assert.ok(output.includes("笔记"));
    assert.ok(output.includes("笔记.md"));
});

test("info: handles emoji filename", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "🚀 Rocket.md"), "# Rocket\nEmoji note\n");
    const output = withVault(root, () => capture(() => info("🚀 Rocket")));
    assert.ok(output.includes("🚀 Rocket"));
    assert.ok(output.includes("🚀 Rocket.md"));
});

test("info: reports error for missing note", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Exists.md"), "content\n");
    const output = withVault(root, () => capture(() => info("Missing")));
    assert.ok(output.includes("Note not found"));
    assert.ok(output.includes("Missing"));
});

test("info: handles empty note", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Empty.md"), "");
    const output = withVault(root, () => capture(() => info("Empty")));
    assert.ok(output.includes("Note Information"));
    assert.ok(output.includes("Empty"));
    assert.ok(output.includes("Words"));
    assert.ok(output.includes("0"));
});

test("info: shows heading outline", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Guide.md"),
        "# Main\n\n## Section A\n\n### Sub A1\n\n## Section B\n"
    );
    const output = withVault(root, () => capture(() => info("Guide")));
    assert.ok(output.includes("Headings"));
    assert.ok(output.includes("Main"));
    assert.ok(output.includes("Section A"));
    assert.ok(output.includes("Sub A1"));
    assert.ok(output.includes("Section B"));
    assert.ok(output.includes("\u2514\u2500\u2500"));
    assert.ok(output.includes("\u251C\u2500\u2500"));
});

test("info: note with no headings omits heading section", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Plain.md"), "Just some text.\n");
    const output = withVault(root, () => capture(() => info("Plain")));
    assert.ok(output.includes("Note Information"));
    assert.ok(!output.includes("Headings"));
});

test("info: counts outgoing wikilinks", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Home.md"),
        "See [[Rust]] and [[Python]] and [[Go]].\n"
    );
    fs.writeFileSync(path.join(root, "Rust.md"), "Rust\n");
    fs.writeFileSync(path.join(root, "Python.md"), "Python\n");
    fs.writeFileSync(path.join(root, "Go.md"), "Go\n");
    const output = withVault(root, () => capture(() => info("Home")));
    assert.ok(output.includes("Outgoing"));
    assert.ok(output.includes("3"));
});

test("info: counts backlinks", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Target.md"), "# Target\n");
    fs.writeFileSync(path.join(root, "A.md"), "Link to [[Target]].\n");
    fs.writeFileSync(path.join(root, "B.md"), "Also [[Target]].\n");
    fs.writeFileSync(path.join(root, "C.md"), "No links here.\n");
    const output = withVault(root, () => capture(() => info("Target")));
    assert.ok(output.includes("Backlinks"));
    assert.ok(output.includes("2"));
});

test("info: counts related notes", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Home.md"),
        "# Home\n\n## Related\n\n- [[Rust]]\n- [[Python]]\n"
    );
    fs.writeFileSync(path.join(root, "Rust.md"), "Rust\n");
    fs.writeFileSync(path.join(root, "Python.md"), "Python\n");
    const output = withVault(root, () => capture(() => info("Home")));
    assert.ok(output.includes("Related"));
    assert.ok(output.includes("2"));
});

test("info: shows tags", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Tagged.md"),
        "# Note\nSome content #rust #web\n"
    );
    const output = withVault(root, () => capture(() => info("Tagged")));
    assert.ok(output.includes("Tags"));
    assert.ok(output.includes("#rust"));
    assert.ok(output.includes("#web"));
});

test("info: note with no tags omits tag section", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "NoTags.md"), "# No tags here\n");
    const output = withVault(root, () => capture(() => info("NoTags")));
    assert.ok(output.includes("Note Information"));
    assert.ok(!output.includes("#tag"));
    assert.ok(!output.includes("#rust"));
});

test("info: deduplicates tags", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Dupe.md"),
        "# Dupe\nTag #rust here and #rust again.\n"
    );
    const output = withVault(root, () => capture(() => info("Dupe")));
    const rustCount = (output.match(/#rust/g) || []).length;
    assert.equal(rustCount, 1);
});

test("info: tags inside code blocks are ignored", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "CodeTag.md"),
        "# Code\n\n```\n#notatag\n```\n\n#real\n"
    );
    const output = withVault(root, () => capture(() => info("CodeTag")));
    assert.ok(output.includes("#real"));
    assert.ok(!output.includes("#notatag"));
});

test("info: handles CRLF line endings", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "CRLF.md"), "# CRLF\r\nContent here\r\n");
    const output = withVault(root, () => capture(() => info("CRLF")));
    assert.ok(output.includes("Note Information"));
    assert.ok(output.includes("CRLF"));
    assert.ok(output.includes("Headings"));
});

test("info: handles LF line endings", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "LF.md"), "# LF\nContent here\n");
    const output = withVault(root, () => capture(() => info("LF")));
    assert.ok(output.includes("Note Information"));
    assert.ok(output.includes("LF"));
});

test("info: note with no links shows zero counts", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "NoLinks.md"), "# No links\nJust text.\n");
    const output = withVault(root, () => capture(() => info("NoLinks")));
    assert.ok(output.includes("Outgoing"));
    assert.ok(output.includes("Backlinks"));
    assert.ok(output.includes("Related"));
    assert.ok(output.includes("0"));
});

test("info: note with deep heading hierarchy", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Deep.md"),
        "# L1\n## L2\n### L3\n#### L4\n##### L5\n###### L6\n"
    );
    const output = withVault(root, () => capture(() => info("Deep")));
    assert.ok(output.includes("L1"));
    assert.ok(output.includes("L2"));
    assert.ok(output.includes("L3"));
    assert.ok(output.includes("L4"));
    assert.ok(output.includes("L5"));
    assert.ok(output.includes("L6"));
});

test("info: heading hierarchy skips levels gracefully", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Skip.md"),
        "# Main\n### Skipped to H3\n"
    );
    const output = withVault(root, () => capture(() => info("Skip")));
    assert.ok(output.includes("Main"));
    assert.ok(output.includes("Skipped to H3"));
});

test("info: file size is displayed", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Size.md"), "A".repeat(2048));
    const output = withVault(root, () => capture(() => info("Size")));
    assert.ok(output.includes("KB"));
});

test("info: word count is displayed", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Words.md"), "one two three four five\n");
    const output = withVault(root, () => capture(() => info("Words")));
    assert.ok(output.includes("5"));
});

test("info: created and modified dates are shown", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Dates.md"), "# Dates\n");
    const output = withVault(root, () => capture(() => info("Dates")));
    assert.ok(output.includes("Created"));
    assert.ok(output.includes("Modified"));
    assert.ok(output.includes("20"));
});

test("info: handles broken/incomplete Markdown", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Broken.md"), "# Heading\n## \n###\n[[[\n");
    const output = withVault(root, () => capture(() => info("Broken")));
    assert.ok(output.includes("Note Information"));
    assert.ok(output.includes("Broken"));
});

test("info: empty vault with missing note", () => {
    const root = makeVault();
    const output = withVault(root, () => capture(() => info("Ghost")));
    assert.ok(output.includes("Note not found"));
});

test("info: handles note with only frontmatter-like content", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Frontmatter.md"),
        "---\ntitle: Test\n---\n# Content\n"
    );
    const output = withVault(root, () => capture(() => info("Frontmatter")));
    assert.ok(output.includes("Note Information"));
    assert.ok(output.includes("Content"));
});

test("info: handles note with attachments in links", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "WithImages.md"),
        "See [[image.png]] and [[Rust]] and [[doc.pdf]].\n"
    );
    fs.writeFileSync(path.join(root, "Rust.md"), "Rust\n");
    const output = withVault(root, () => capture(() => info("WithImages")));
    assert.ok(output.includes("Outgoing"));
    assert.ok(output.includes("1"));
});

test("info: case-insensitive note resolution", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "MyNote.md"), "# MyNote\n");
    const output = withVault(root, () => capture(() => info("mynote")));
    assert.ok(output.includes("MyNote"));
    assert.ok(output.includes("MyNote.md"));
});

test("info: word count strips markdown syntax", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Syntax.md"),
        "# Heading\n\n**bold** and *italic* and `code`.\n\n```\ncode block\n```\n"
    );
    const output = withVault(root, () => capture(() => info("Syntax")));
    assert.ok(output.includes("Words"));
});

test("info: outgoing links with heading fragments", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Links.md"),
        "See [[Rust#Getting Started]] and [[Python]].\n"
    );
    fs.writeFileSync(path.join(root, "Rust.md"), "Rust\n");
    fs.writeFileSync(path.join(root, "Python.md"), "Python\n");
    const output = withVault(root, () => capture(() => info("Links")));
    assert.ok(output.includes("Outgoing"));
    assert.ok(output.includes("2"));
});

test("info: multiple notes with same name in different folders", () => {
    const root = makeVault();
    fs.mkdirSync(path.join(root, "A"), { recursive: true });
    fs.mkdirSync(path.join(root, "B"), { recursive: true });
    fs.writeFileSync(path.join(root, "A", "Note.md"), "# A Note\n");
    fs.writeFileSync(path.join(root, "B", "Note.md"), "# B Note\n");
    const output = withVault(root, () => capture(() => info("Note")));
    assert.ok(output.includes("Note Information"));
    assert.ok(output.includes("Note.md"));
});

test("info: note with wikilinks to same note (no self-backlink)", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Self.md"), "Link to [[Self]].\n");
    const output = withVault(root, () => capture(() => info("Self")));
    assert.ok(output.includes("Backlinks"));
    assert.ok(output.includes("0"));
});

test("info: mixed links and tags", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Mixed.md"),
        "# Mixed\n\nSee [[Rust]] and #rust and #web.\n"
    );
    fs.writeFileSync(path.join(root, "Rust.md"), "Rust\n");
    const output = withVault(root, () => capture(() => info("Mixed")));
    assert.ok(output.includes("Outgoing"));
    assert.ok(output.includes("1"));
    assert.ok(output.includes("#rust"));
    assert.ok(output.includes("#web"));
});

test("info: note with no outgoing links and no backlinks", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Alone.md"), "# Alone\nJust me.\n");
    const output = withVault(root, () => capture(() => info("Alone")));
    assert.ok(output.includes("Outgoing"));
    assert.ok(output.includes("0"));
    assert.ok(output.includes("Backlinks"));
    assert.ok(output.includes("0"));
    assert.ok(output.includes("Related"));
    assert.ok(output.includes("0"));
});

test("info: heading tree uses correct connectors", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Tree.md"),
        "# A\n## B\n### B1\n## C\n"
    );
    const output = withVault(root, () => capture(() => info("Tree")));
    assert.ok(output.includes("\u251C\u2500\u2500"));
    assert.ok(output.includes("\u2514\u2500\u2500"));
    assert.ok(output.includes("\u2502"));
});
