const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildVaultIndex } = require("../utils/vaultIndex");

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

// ─── Empty Vault ─────────────────────────────────────────────────────

test("vaultIndex: empty vault has no notes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-idx-empty-"));
    const index = withVault(root, () => buildVaultIndex(root));
    assert.ok(Array.isArray(index.notes));
    assert.equal(index.notes.length, 0);
    assert.equal(index.byName.size, 0);
    assert.equal(index.referenced.size, 0);
});

// ─── Basic Index ─────────────────────────────────────────────────────

test("vaultIndex: indexes nested notes with normalized names", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-idx-basic-"));
    fs.mkdirSync(path.join(root, "Projects"), { recursive: true });
    fs.mkdirSync(path.join(root, "Notes"), { recursive: true });
    fs.writeFileSync(path.join(root, "Projects", "Alpha.md"), "content");
    fs.writeFileSync(path.join(root, "Notes", "Beta Note.md"), "other");

    const index = withVault(root, () => buildVaultIndex(root));

    assert.equal(index.notes.length, 2);
    assert.ok(index.byName.has("alpha"));
    assert.ok(index.byName.has("beta note"));

    const alpha = index.byName.get("alpha");
    assert.equal(alpha.relPath, "Projects/Alpha.md");
    assert.equal(alpha.name, "Alpha");
    assert.equal(alpha.content, "content");
});

// ─── Outgoing Links & Backlinks ──────────────────────────────────────

test("vaultIndex: outgoing and backlinks across notes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-idx-links-"));
    fs.writeFileSync(
        path.join(root, "A.md"),
        "[[B]]\n[[B]]\n[[Missing]]\n"
    );
    fs.writeFileSync(path.join(root, "B.md"), "[[A]]\n");

    const index = withVault(root, () => buildVaultIndex(root));

    const a = index.byName.get("a");
    const b = index.byName.get("b");

    assert.deepEqual(a.outgoing, ["b", "missing"]);
    assert.deepEqual(a.outgoingDetails.map((l) => l.raw), ["B", "B", "Missing"]);
    assert.deepEqual(a.backlinks, ["B"]);
    assert.deepEqual(b.backlinks, ["A"]);
});

// ─── Tags & Reference Tracking ───────────────────────────────────────

test("vaultIndex: extracts lowercase tags and tracks referenced notes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-idx-tags-"));
    fs.writeFileSync(path.join(root, "A.md"), "#Tag1 #tag-2 #tag-1\n[[B]]\n");
    fs.writeFileSync(path.join(root, "B.md"), "no tags\n");

    const index = withVault(root, () => buildVaultIndex(root));

    const a = index.byName.get("a");
    assert.deepEqual(a.tags, ["tag-1", "tag-2", "tag1"]);
    assert.ok(index.referenced.has("b"));
    assert.ok(!index.referenced.has("a"));
});

// ─── Self & Circular Links ───────────────────────────────────────────

test("vaultIndex: self reference is not a backlink", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-idx-self-"));
    fs.writeFileSync(path.join(root, "A.md"), "[[A]]\n");

    const index = withVault(root, () => buildVaultIndex(root));

    const a = index.byName.get("a");
    assert.deepEqual(a.outgoing, ["a"]);
    assert.deepEqual(a.backlinks, []);
});

// ─── Unicode, Emoji & Spaces ─────────────────────────────────────────

test("vaultIndex: handles unicode, emoji, and spaced filenames", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-idx-unicode-"));
    fs.mkdirSync(path.join(root, "Notes"), { recursive: true });
    fs.writeFileSync(path.join(root, "Notes", "日本語ノート.md"), "# 日本語ノート\ncontent\n");
    fs.writeFileSync(path.join(root, "Notes", "🚀 Launch.md"), "content\n");
    fs.writeFileSync(path.join(root, "Notes", "日本語ノート.md"), "[[🚀 Launch]]\n");

    const index = withVault(root, () => buildVaultIndex(root));

    assert.equal(index.notes.length, 2);
    assert.ok(index.byName.has("日本語ノート"));
    assert.ok(index.byName.has("🚀 launch"));

    const jp = index.byName.get("日本語ノート");
    assert.deepEqual(jp.outgoing, ["🚀 launch"]);
    const launch = index.byName.get("🚀 launch");
    assert.deepEqual(launch.backlinks, ["日本語ノート"]);
});