const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { scanIncomingLinks } = require("../utils/relationship/scanner");
const {
    tokenizeBody,
    buildSimilarityIndex,
    findBodyMatches,
    cosineSimilarity,
    MAX_TOKENS_PER_NOTE,
    MAX_TOKEN_LENGTH,
    MAX_CJK_RUN,
} = require("../utils/relationship/similarity");

function makeVault(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-sim-"));
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return root;
}

function vaultFiles(root) {
    return fs
        .readdirSync(root, { recursive: true })
        .filter((entry) => typeof entry === "string" && entry.endsWith(".md"))
        .map((entry) => path.join(root, entry));
}

// --- Tokenization ------------------------------------------------------

test("tokenizeBody: lowercases and de-duplicates tokens", () => {
    assert.deepEqual(tokenizeBody("Kubernetes kubernetes KUBERNETES controller"), [
        "kubernetes",
        "controller",
    ]);
});

test("tokenizeBody: drops markdown syntax but keeps link text", () => {
    const tokens = tokenizeBody(
        [
            "# Heading",
            "**bold** and _italic_ and ~~struck~~",
            "- bullet item",
            "> quoted line",
            "| a | b |",
            "[[Wikilink Target|Alias Text]]",
            "[[Plain Target]]",
            "[Inline Link](https://example.com/page)",
            "![alt image](image.png)",
        ].join("\n")
    );

    assert.ok(tokens.includes("heading"));
    assert.ok(tokens.includes("bold"));
    assert.ok(tokens.includes("item"));
    // The alias is what a reader actually sees, so it is the body text.
    assert.ok(tokens.includes("alias"));
    assert.ok(!tokens.includes("wikilink"));
    assert.ok(tokens.includes("plain"));
    assert.ok(tokens.includes("inline"));
    assert.ok(!tokens.includes("https"));
    assert.ok(!tokens.includes("com"));
    assert.ok(!tokens.includes("png"));
});

test("tokenizeBody: ignores fenced and inline code", () => {
    const tokens = tokenizeBody(
        "prose token here\n```js\nsecretcode variable\n```\ninline `alsosecret` tail\n"
    );

    assert.ok(tokens.includes("prose"));
    assert.ok(!tokens.includes("secretcode"));
    assert.ok(!tokens.includes("variable"));
    assert.ok(!tokens.includes("alsosecret"));
});

test("tokenizeBody: ignores frontmatter keys and values", () => {
    const tokens = tokenizeBody(
        "---\ntitle: My Frontmatter Title\ntags: [alpha]\n---\nreal body token\n"
    );

    assert.deepEqual(tokens, ["real", "body", "token"]);
});

test("tokenizeBody: drops body noise words", () => {
    const tokens = tokenizeBody("this is the kind of note that was written for you");
    assert.deepEqual(tokens, ["kind", "written"]);
});

test("tokenizeBody: is bounded per note", () => {
    const words = Array.from({ length: MAX_TOKENS_PER_NOTE * 3 }, (_, i) => `word${i}`);
    const tokens = tokenizeBody(words.join(" "));

    assert.equal(tokens.length, MAX_TOKENS_PER_NOTE);
    assert.deepEqual(tokens, tokens.slice(0, MAX_TOKENS_PER_NOTE));
});

test("tokenizeBody: ignores overlong runs", () => {
    const long = "z".repeat(MAX_TOKEN_LENGTH + 1);
    const tokens = tokenizeBody(`${long} short`);
    assert.deepEqual(tokens, ["short"]);
});

test("tokenizeBody: keeps unicode words intact", () => {
    const tokens = tokenizeBody("Grüße Übermäßig naïve café ÅNGSTRÖM");
    assert.deepEqual(tokens, ["grüße", "übermäßig", "naïve", "café", "ångström"]);
});

test("tokenizeBody: emits overlapping bigrams for unspaced CJK text", () => {
    assert.deepEqual(tokenizeBody("笔记笔记笔记"), ["笔记", "记笔"]);
    assert.deepEqual(tokenizeBody("日本語"), ["日本", "本語"]);
});

test("tokenizeBody: bounds expansion of a very long CJK run", () => {
    const long = "笔记".repeat(MAX_CJK_RUN);
    const tokens = tokenizeBody(long);

    assert.ok(tokens.length > 0);
    assert.ok(tokens.length < long.length / 2, "run expansion stays bounded");
    assert.ok(tokens.length <= MAX_TOKENS_PER_NOTE);
});

test("tokenizeBody: CJK bigrams are comparable to spaced prose", () => {
    const a = new Set(tokenizeBody("Kubernetes operator controller loop"));
    const b = new Set(tokenizeBody("笔记 operator 控制 循环"));
    assert.ok(a.has("operator") && b.has("operator"));
});

test("tokenizeBody: handles empty and non-string input", () => {
    assert.deepEqual(tokenizeBody(""), []);
    assert.deepEqual(tokenizeBody(undefined), []);
    assert.deepEqual(tokenizeBody(null), []);
});

test("tokenizeBody: is deterministic", () => {
    const content = "#Doc\nalpha beta gamma [[Link]] `code`\n";
    assert.deepEqual(tokenizeBody(content), tokenizeBody(content));
});

// --- Similarity index --------------------------------------------------

test("buildSimilarityIndex: indexes tokens once per note", () => {
    const index = buildSimilarityIndex([
        { relPath: "a.md", content: "alpha beta gamma" },
        { relPath: "b.md", content: "alpha beta gamma" },
    ]);

    assert.equal(index.size, 2);
    assert.deepEqual(index.tokensByRelPath.get("a.md"), ["alpha", "beta", "gamma"]);
    assert.deepEqual(index.postings.get("alpha"), ["a.md", "b.md"]);
});

test("buildSimilarityIndex: tolerates an empty or missing note list", () => {
    assert.equal(buildSimilarityIndex([]).size, 0);
    assert.equal(buildSimilarityIndex(undefined).size, 0);
});

test("cosineSimilarity: is symmetric, bounded and zero for empty sets", () => {
    assert.equal(cosineSimilarity(0, 5, 0), 0);
    assert.equal(cosineSimilarity(5, 0, 0), 0);
    assert.equal(cosineSimilarity(4, 4, 4), 1);
    assert.equal(cosineSimilarity(4, 4, 2), 0.5);
    assert.equal(cosineSimilarity(4, 9, 3), cosineSimilarity(9, 4, 3));
    assert.ok(cosineSimilarity(100, 3, 3) <= 1);
});

test("findBodyMatches: returns ranked candidates with shared tokens", () => {
    const index = buildSimilarityIndex([
        { relPath: "a.md", content: "alpha bravo charlie delta echo foxtrot" },
        { relPath: "b.md", content: "alpha bravo charlie delta echo golf" },
        { relPath: "c.md", content: "sourdough starter hydration temperature" },
    ]);

    const matches = findBodyMatches(index, { relPath: "a.md" });

    assert.equal(matches.length, 1);
    assert.equal(matches[0].relPath, "b.md");
    assert.equal(matches[0].shared, 5);
    assert.deepEqual(matches[0].tokens, ["alpha", "bravo", "charlie", "delta", "echo"]);
    assert.ok(matches[0].similarity > 0.8);
});

test("findBodyMatches: never returns the note itself", () => {
    const index = buildSimilarityIndex([
        { relPath: "a.md", content: "alpha bravo charlie delta" },
        { relPath: "b.md", content: "alpha bravo charlie delta" },
    ]);

    for (const match of findBodyMatches(index, { relPath: "a.md" })) {
        assert.notEqual(match.relPath, "a.md");
    }
});

test("findBodyMatches: respects minSharedTokens and candidateLimit", () => {
    const index = buildSimilarityIndex([
        { relPath: "a.md", content: "alpha bravo charlie delta echo" },
        { relPath: "weak.md", content: "alpha zulu yankee" },
        { relPath: "strong.md", content: "alpha bravo charlie delta golf" },
    ]);

    assert.deepEqual(
        findBodyMatches(index, { relPath: "a.md" }, { minSharedTokens: 4 }).map(
            (m) => m.relPath
        ),
        ["strong.md"]
    );

    assert.deepEqual(
        findBodyMatches(index, { relPath: "a.md" }, { minSharedTokens: 5 }),
        []
    );

    assert.deepEqual(
        findBodyMatches(index, { relPath: "a.md" }, { candidateLimit: 1 }).map(
            (m) => m.relPath
        ),
        ["strong.md"]
    );
});

test("findBodyMatches: skips tokens carried by most of the vault", () => {
    const notes = [{ relPath: "a.md", content: "common raretoken one two" }];
    for (let i = 0; i < 20; i += 1) {
        notes.push({
            relPath: `n${i}.md`,
            content: `common raretoken filler${i} other${i}`,
        });
    }
    const index = buildSimilarityIndex(notes);

    // "common" is in 21 of 21 notes and cannot discriminate; the remaining
    // discriminative tokens are still under the shared-token floor.
    const matches = findBodyMatches(index, { relPath: "a.md" });
    assert.equal(matches.length, 0);
});

test("findBodyMatches: returns nothing without a similarity index", () => {
    assert.deepEqual(findBodyMatches(null, { relPath: "a.md" }), []);
});

test("findBodyMatches: notes with too little text are skipped", () => {
    const index = buildSimilarityIndex([
        { relPath: "a.md", content: "alpha bravo" },
        { relPath: "b.md", content: "alpha bravo" },
    ]);

    assert.deepEqual(findBodyMatches(index, { relPath: "a.md" }), []);
});

// --- Incoming link correctness -----------------------------------------

test("scanIncomingLinks: collapses repeated references to one target", () => {
    const root = makeVault({
        "Note A.md": "[[Note B]]\n[[Note B]]\n[[note b]]\n[[Note B#Section]]\n",
    });
    const incoming = scanIncomingLinks(vaultFiles(root));

    assert.deepEqual(incoming["note b"].map((l) => l.source), ["Note A"]);
});

test("scanIncomingLinks: drops self references", () => {
    const root = makeVault({
        "Solo.md": "[[Solo]]\n[[solo]]\n[[SOLO]]\n",
    });
    const incoming = scanIncomingLinks(vaultFiles(root));

    assert.deepEqual(incoming, {});
});

test("scanIncomingLinks: keeps distinct sources and heading/alias detail", () => {
    const root = makeVault({
        "One.md": "[[Hub#Section|Alias]]\n",
        "Two.md": "[[hub]]\n",
        "Hub.md": "hub\n",
    });
    const incoming = scanIncomingLinks(vaultFiles(root));

    assert.deepEqual(incoming.hub.map((l) => l.source), ["One", "Two"]);
    assert.equal(incoming.hub[0].alias, "Alias");
    assert.equal(incoming.hub[0].heading, "Section");
    assert.equal(incoming.hub[1].alias, null);
});

test("scanIncomingLinks: treats a same-basename reference as a self reference", () => {
    const root = makeVault({
        "Sub1/Note.md": "[[note]]\n",
        "Sub2/note.md": "body\n",
    });
    const incoming = scanIncomingLinks(vaultFiles(root));

    // This scanner resolves notes by basename only, the same way
    // findNoteFile does, so it cannot tell that "note" means Sub2/note.md.
    // The path-aware vault index is the authority for that case.
    assert.deepEqual(incoming, {});
});
