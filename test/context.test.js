const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    retrieveContext,
    buildContext,
    tokenizeQuestion,
    normalizeLimit,
    DEFAULT_MAX_CHARS_PER_NOTE,
} = require("../checks/context");
const { buildVaultIndex } = require("../utils/vaultIndex");

// ─── Helpers ─────────────────────────────────────────────────────────

function buildDir(files, prefix = "obs-context-") {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return root;
}

// Strips the volatile note object down to the deterministic ranking fields.
function view(retrieval) {
    return retrieval.results.map((result) => ({
        relPath: result.note.relPath,
        score: result.score,
        reasons: result.reasons.map((reason) => reason.type),
    }));
}

function hashTree(root) {
    const hashes = new Map();

    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else {
                const digest = crypto
                    .createHash("sha256")
                    .update(fs.readFileSync(full))
                    .digest("hex");
                hashes.set(path.relative(root, full).split(path.sep).join("/"), digest);
            }
        }
    }

    walk(root);
    return hashes;
}

// ─── Tokenizer / limits ──────────────────────────────────────────────

test("context: tokenizer drops stopwords, short tokens, and duplicates", () => {
    assert.deepEqual(tokenizeQuestion("Apa itu Rust ownership dan borrowing?"), [
        "rust",
        "ownership",
        "borrowing",
    ]);
    assert.deepEqual(tokenizeQuestion("#rust #RUST"), ["rust"]);
    assert.deepEqual(tokenizeQuestion(""), []);
});

test("context: normalizeLimit clamps and falls back to the default", () => {
    assert.equal(normalizeLimit(undefined), 5);
    assert.equal(normalizeLimit("0"), 5);
    assert.equal(normalizeLimit("-3"), 5);
    assert.equal(normalizeLimit("abc"), 5);
    assert.equal(normalizeLimit("3"), 3);
    assert.equal(normalizeLimit("999"), 12);
});

// ─── Retrieval ───────────────────────────────────────────────────────

test("context: ranks notes by lexical relevance and is deterministic", () => {
    const root = buildDir({
        "Notes/Rust Ownership.md":
            "# Rust Ownership\n\nRust ownership, borrowing, and lifetimes. #rust\n",
        "Notes/Cooking Pasta.md": "# Cooking Pasta\n\nBoil water and add salt.\n",
        "Notes/JS Closures.md": "# JS Closures\n\nFunctions capture their scope.\n",
    });

    const index = buildVaultIndex(root);
    const question = "bagaimana cara kerja rust ownership dan borrowing";
    const first = retrieveContext(index, question);
    const second = retrieveContext(index, question);

    assert.equal(first.results[0].note.relPath, "Notes/Rust Ownership.md");
    assert.ok(first.results[0].score > 0);
    assert.deepEqual(view(first), view(second));

    // Same directory indexed afresh must rank identically.
    const fresh = retrieveContext(buildVaultIndex(root), question);
    assert.deepEqual(view(first), view(fresh));
});

test("context: ranking is case-insensitive", () => {
    const root = buildDir({
        "Notes/Rust Ownership.md": "# Rust Ownership\n\nownership and borrowing\n",
    });
    const index = buildVaultIndex(root);
    assert.deepEqual(
        view(retrieveContext(index, "RUST Ownership")),
        view(retrieveContext(index, "rust ownership"))
    );
});

test("context: keeps duplicate basenames distinct by relPath", () => {
    const root = buildDir({
        "FolderA/Note.md": "# Note\n\nalpha unique topic about quantum\n",
        "FolderB/Note.md": "# Note\n\nbeta unique topic about gardening\n",
    });

    const index = buildVaultIndex(root);
    assert.equal(index.notes.length, 2);

    const retrieval = retrieveContext(index, "quantum topic", { diagnostics: [] });
    assert.equal(retrieval.results[0].note.relPath, "FolderA/Note.md");
    assert.ok(retrieval.results.every((result) => result.note.name === "Note"));

    const relPaths = retrieval.results.map((result) => result.note.relPath);
    assert.deepEqual(relPaths, [...new Set(relPaths)]);
});

test("context: spaced-script terms never match inside unrelated words", () => {
    const root = buildDir({
        "Notes/Car.md": "# Car\n\nstart the engine and part ways\n",
        "Notes/Tech.md": "# Tech\n\ndigital tools and legit login pages\n",
        "Notes/Word.md": "# Word\n\nnational mission vision\n",
    });

    const index = buildVaultIndex(root);

    for (const query of ["art", "git", "ion"]) {
        const retrieval = retrieveContext(index, query, { diagnostics: [] });
        assert.deepEqual(retrieval.results, [], `"${query}" leaked a substring hit`);
    }
});

test("context: spaced-script terms never match inside filenames or tags", () => {
    const root = buildDir({
        "Notes/Digital Tools.md": "# Digital Tools\n\nplain prose\n",
        "Notes/Mission Control.md": "# Mission Control\n\nrevision of letters\n#vision\n",
    });

    const index = buildVaultIndex(root);

    for (const query of ["git", "tal", "ion", "vis"]) {
        const retrieval = retrieveContext(index, query, { diagnostics: [] });
        assert.deepEqual(
            retrieval.results,
            [],
            `"${query}" leaked a filename/tag substring hit`
        );
    }
});

test("context: reports truncation when matches exceed the retrieval limit", () => {
    const files = {};
    for (let i = 0; i < 8; i += 1) {
        files[`Notes/Note${i}.md`] = `# Note ${i}\n\nshared keyword alpha content ${i}\n`;
    }
    const root = buildDir(files);

    const retrieval = retrieveContext(buildVaultIndex(root), "shared keyword alpha", {
        limit: 3,
        diagnostics: [],
    });
    assert.equal(retrieval.results.length, 3);
    assert.ok(retrieval.candidateCount > 3);

    const context = buildContext(retrieval, { maxNotes: 3 });
    assert.equal(context.selectedCount, 3);
    assert.equal(context.candidateCount, retrieval.candidateCount);
    assert.equal(context.truncated, true);
    assert.ok(context.text.includes("Batasan"));
});

test("context: handles unicode filenames and nested paths", () => {
    const root = buildDir({
        "Catatan/日本語/メモ.md":
            "# メモ\n\nこれは日本語のメモです。rust offline docs\n",
        "Catatan/Δενδρο.md": "# Δενδρο\n\nΤο δεντρο ειναι ψηλο\n",
        "Deep/Nested/Levels/İstanbul.md": "# İstanbul\n\nsehir ve kopru\n",
    });

    const index = buildVaultIndex(root);
    const retrieval = retrieveContext(index, "日本語 rust", { diagnostics: [] });

    assert.equal(retrieval.results[0].note.relPath, "Catatan/日本語/メモ.md");
    assert.ok(retrieval.results[0].note.relPath.includes("日本語"));

    // Unicode identity survives the round-trip through the index.
    assert.ok(index.notes.some((note) => note.relPath === "Catatan/Δενδρο.md"));
    assert.ok(
        index.notes.some((note) => note.relPath === "Deep/Nested/Levels/İstanbul.md")
    );
});

test("context: tag-driven relevance outranks plain content mention", () => {
    const root = buildDir({
        "Notes/Tagged.md": "# Tagged\n\nsome unrelated words here #rust\n",
        "Notes/Untagged.md": "# Untagged\n\nrust is only mentioned in prose\n",
    });

    const retrieval = retrieveContext(buildVaultIndex(root), "#rust offline", {
        diagnostics: [],
    });

    assert.equal(retrieval.results[0].note.relPath, "Notes/Tagged.md");
    assert.ok(
        retrieval.results[0].reasons.some((reason) => reason.type === "tag")
    );
});

test("context: exact title matches win the phrase bonus", () => {
    const root = buildDir({
        "Projects/Project Alpha.md": "# Project Alpha\n\nkickoff notes\n",
        "Notes/Alpha Notes.md": "# Alpha Notes\n\nmisc\n",
    });

    const retrieval = retrieveContext(buildVaultIndex(root), "project alpha status", {
        diagnostics: [],
    });

    assert.equal(retrieval.results[0].note.relPath, "Projects/Project Alpha.md");
    assert.ok(
        retrieval.results[0].reasons.some((reason) => reason.type === "phrase")
    );
});

test("context: integrates with relationship infrastructure", () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\nProject overview. [[Alpha]]\n",
        "Notes/Alpha.md": "# Alpha\n\nDetailed alpha specification.\n",
    });

    const index = buildVaultIndex(root);
    const hub = index.byName.get("hub");
    assert.deepEqual(hub.outgoing, ["alpha"]);

    const retrieval = retrieveContext(index, "alpha specification", {
        diagnostics: [],
    });
    assert.equal(retrieval.results[0].note.relPath, "Notes/Alpha.md");

    const hubNote = index.notes.find((note) => note.relPath === "Notes/Hub.md");
    assert.ok(hubNote.outgoing.includes("alpha"));
});

test("context: surfaces diagnostics for selected sources", () => {
    const root = buildDir({
        "Notes/Broken.md": "---\nkey: value\n\nquantum flux content\n",
    });

    const retrieval = retrieveContext(buildVaultIndex(root), "quantum flux");
    assert.equal(retrieval.results[0].note.relPath, "Notes/Broken.md");
    assert.ok(
        retrieval.results[0].diagnostics.includes("METADATA_MALFORMED_FRONTMATTER")
    );

    const context = buildContext(retrieval);
    assert.ok(context.text.includes("METADATA_MALFORMED_FRONTMATTER"));
    assert.ok(context.text.includes("isu vault"));
});

// ─── Context building ────────────────────────────────────────────────

test("context: empty retrieval reports insufficient context", () => {
    const root = buildDir({ "Notes/Alpha.md": "# Alpha\n\nalpha content\n" });

    const retrieval = retrieveContext(buildVaultIndex(root), "zebra xylophone", {
        diagnostics: [],
    });
    assert.equal(retrieval.results.length, 0);

    const context = buildContext(retrieval);
    assert.equal(context.hasContext, false);
    assert.equal(context.selectedCount, 0);
    assert.ok(context.text.includes("tidak cukup"));
});

test("context: caps the number of selected notes", () => {
    const files = {};
    for (let i = 0; i < 8; i += 1) {
        files[`Notes/Note${i}.md`] = `# Note ${i}\n\nshared keyword alpha content ${i}\n`;
    }
    const root = buildDir(files);

    const retrieval = retrieveContext(buildVaultIndex(root), "shared keyword alpha", {
        limit: 20,
        diagnostics: [],
    });
    assert.ok(retrieval.results.length > 5);

    const context = buildContext(retrieval, { maxNotes: 3 });
    assert.equal(context.selectedCount, 3);
    assert.equal(context.notes.length, 3);
    assert.equal(context.truncated, true);
    assert.ok(context.text.includes("Batasan"));
});

test("context: caps characters per note and total size", () => {
    const root = buildDir({
        "Big/One.md": "# Big One\n\n" + "alpha ".repeat(4000) + "\n",
        "Big/Two.md": "# Big Two\n\n" + "alpha ".repeat(4000) + "\n",
    });

    const retrieval = retrieveContext(buildVaultIndex(root), "alpha", {
        diagnostics: [],
    });
    const context = buildContext(retrieval, {
        maxCharsPerNote: 100,
        maxTotalChars: 400,
    });

    assert.ok(context.usedChars <= 400);
    assert.ok(context.notes[0].excerpt.length <= 100 + 2); // "…" on both ends
    assert.equal(context.notes[0].excerptTruncated, true);
    assert.ok(DEFAULT_MAX_CHARS_PER_NOTE >= 100);
});

test("context: default limits are always applied when options are absent", () => {
    const root = buildDir({
        "Notes/Alpha.md": "# Alpha\n\nalpha " + "beta ".repeat(5000) + "\n",
    });
    const context = buildContext(
        retrieveContext(buildVaultIndex(root), "alpha")
    );
    assert.ok(context.notes[0].excerpt.length <= DEFAULT_MAX_CHARS_PER_NOTE + 2);
});

test("context: source identity and score are attached to every entry", () => {
    const root = buildDir({
        "Deep/Nested/Note.md": "# Note\n\nalpha content\n",
    });
    const context = buildContext(
        retrieveContext(buildVaultIndex(root), "alpha", { diagnostics: [] })
    );

    assert.equal(context.notes[0].note.relPath, "Deep/Nested/Note.md");
    assert.equal(typeof context.notes[0].score, "number");
    assert.ok(context.text.includes("Deep/Nested/Note.md"));
});

// ─── Mutation safety ─────────────────────────────────────────────────

test("context: retrieval and building never mutate the vault", () => {
    const root = buildDir({
        "Notes/Alpha.md": "# Alpha\n\nalpha content about rust\n",
        "Notes/Beta.md": "# Beta\n\nbeta content\n",
    });

    const before = hashTree(root);
    const index = buildVaultIndex(root);
    const retrieval = retrieveContext(index, "alpha rust");
    buildContext(retrieval);
    const after = hashTree(root);

    assert.deepEqual([...before.entries()], [...after.entries()]);
});
