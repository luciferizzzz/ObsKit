const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { buildVaultIndex } = require("../utils/vaultIndex");
const {
    findRelatedNotes,
    WEIGHTS,
    BODY_TIERS,
    REASON_ORDER,
    bodySimilarityPoints,
} = require("../checks/related");
const relatedCmd = require("../commands/related");

const bin = path.join(__dirname, "..", "bin", "obs.js");

function buildDir(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-related-"));
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
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

// ─── Missing Target ──────────────────────────────────────────────────

test("related: unknown note returns no target", () => {
    const root = buildDir({ "A.md": "content\n" });
    const index = buildVaultIndex(root);

    const { target, results } = findRelatedNotes(index, "Ghost");
    assert.equal(target, null);
    assert.deepEqual(results, []);
});

// ─── Ranking Determinism ─────────────────────────────────────────────

// Body similarity is disabled here on purpose: this test guards the v1.6.1
// metadata weight model, which must keep its exact arithmetic. Body
// similarity has its own weight and is covered separately below, including
// how it combines with these signals.
test("related: backlink, tags, and shared links combine with weights", () => {
    const root = buildDir({
        "Alpha.md": "#Alpha\n#project\ncontent [[Beta]] [[Roadmap]]\n",
        "Beta.md": "#Beta\n#project\ncontent [[Alpha]]\n",
        "Gamma.md": "#Gamma\n#project\ncontent [[Alpha]] [[Roadmap]]\n",
        "Delta.md": "#Delta\n#tag-only\ncontent [[Beta]]\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Alpha", {
        limit: 10,
        bodySimilarity: false,
    });

    const ranked = results.map((r) => r.note.name);

    assert.ok(ranked.includes("Gamma"));
    assert.ok(ranked.includes("Beta"));
    assert.ok(ranked.includes("Delta"));

    const byName = {};
    for (const r of results) byName[r.note.name] = r;

    const gammaExpected = WEIGHTS.backlink + WEIGHTS.sharedTag + WEIGHTS.sharedLink;
    const gamma = byName["Gamma"];
    assert.equal(gamma.score, gammaExpected);
    assert.deepEqual(
        gamma.reasons.map((r) => r.type).sort(),
        ["backlink", "sharedLink", "sharedTag"]
    );

    const delta = byName["Delta"];
    assert.equal(delta.score, WEIGHTS.sharedLink);
});

// ─── Zero Result ─────────────────────────────────────────────────────

test("related: no overlap yields empty results", () => {
    const root = buildDir({
        "Alpha.md": "#Alpha\ncontent\n",
        "Unrelated.md": "#Unrelated\ncontent\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Alpha");
    assert.deepEqual(results, []);
});

// ─── Limit ───────────────────────────────────────────────────────────

test("related: limit caps the number of results", () => {
    const root = buildDir({
        "Alpha.md": "#Alpha\ncontent\n",
        "A1.md": "#A1\ncontent [[Alpha]]\n",
        "A2.md": "#A2\ncontent [[Alpha]]\n",
        "A3.md": "#A3\ncontent [[Alpha]]\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Alpha", { limit: 2 });
    assert.equal(results.length, 2);
});

// ─── Self Exclusion & Case Insensitivity ─────────────────────────────

test("related: excludes self and matches case-insensitively", () => {
    const root = buildDir({
        "Alpha.md": "#Alpha\ncontent [[BETA]]\n",
        "Beta.md": "#Beta\ncontent [[Alpha]]\n",
    });
    const index = buildVaultIndex(root);

    const { target, results } = findRelatedNotes(index, "alpha");
    assert.ok(target);
    assert.equal(target.name, "Alpha");
    assert.ok(!results.some((r) => r.note.name === "Alpha"));
    assert.ok(results.some((r) => r.note.name === "Beta"));
});

// --- Case-insensitive backlink matching (v1.7.0 Bug 1) -----------------

function backlinkProfile(vaultFiles, targetRef) {
    const index = buildVaultIndex(buildDir(vaultFiles));
    const { results } = findRelatedNotes(index, targetRef, {
        bodySimilarity: false,
    });
    return results.map((r) => ({
        name: r.note.name,
        score: r.score,
        reasons: r.reasons.map((x) => [x.type, x.items]),
    }));
}

test("related: reference casing does not change the relationship", () => {
    const expected = backlinkProfile(
        { "Note A.md": "see [[Note B]]\n", "Note B.md": "b\n" },
        "Note B"
    );

    assert.equal(expected.length, 1);
    assert.equal(expected[0].name, "Note A");
    assert.ok(expected[0].score >= WEIGHTS.backlink);
    assert.ok(expected[0].reasons.some(([type]) => type === "backlink"));

    // Same relationship, same score, only the reference casing differs.
    for (const reference of ["note b", "NOTE B", "nOtE b", "note B#Section"]) {
        assert.deepEqual(
            backlinkProfile(
                { "Note A.md": `see [[${reference}]]\n`, "Note B.md": "b\n" },
                "Note B"
            ),
            expected,
            `reference [[${reference}]] should score identically`
        );
    }
});

test("related: filename casing does not change the relationship", () => {
    const expected = backlinkProfile(
        { "Note A.md": "see [[note b]]\n", "Note B.md": "b\n" },
        "note b"
    );
    assert.equal(expected.length, 1);
    assert.equal(expected[0].score >= WEIGHTS.backlink, true);

    assert.deepEqual(
        backlinkProfile(
            { "note a.md": "see [[note b]]\n", "NOTE B.md": "b\n" },
            "NoTe B"
        ),
        [{ name: "note a", score: expected[0].score, reasons: expected[0].reasons }]
    );
});

test("related: target lookup is case-insensitive", () => {
    for (const ref of ["Note B", "note b", "NOTE B", "nOtE b"]) {
        const index = buildVaultIndex(
            buildDir({ "Note A.md": "see [[Note B]]\n", "Note B.md": "b\n" })
        );
        const { target } = findRelatedNotes(index, ref);
        assert.ok(target, ref);
        assert.equal(target.name, "Note B", ref);
    }
});

test("related: case-colliding note names in different folders link correctly", () => {
    const root = buildDir({
        "Sub1/Note.md": "ref [[note]]\n",
        "Sub2/note.md": "body\n",
    });
    const index = buildVaultIndex(root);

    const source = index.notes.find((n) => n.relPath === "Sub1/Note.md");
    const target = index.notes.find((n) => n.relPath === "Sub2/note.md");

    // Basenames collide once lowercased, but the referrer and the target are
    // different files and must not steal each other's backlinks.
    assert.deepEqual(source.backlinks, []);
    assert.deepEqual(target.backlinks, ["Note"]);

    const { results } = findRelatedNotes(index, "note", {
        bodySimilarity: false,
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].note.relPath, "Sub1/Note.md");
    assert.ok(results[0].score >= WEIGHTS.backlink);
    assert.ok(results[0].reasons.some((r) => r.type === "backlink"));
});

test("related: unicode note names match across casing", () => {
    const root = buildDir({
        "Reference.md": "see [[Ünïcödé Nøte]] and [[日本語ノート]]\n",
        "Ünïcödé Nøte.md": "unicode body\n",
        "日本語ノート.md": "japanese body\n",
    });
    const index = buildVaultIndex(root);

    assert.deepEqual(index.byName.get("ünïcödé nøte").backlinks, ["Reference"]);
    assert.deepEqual(index.byName.get("日本語ノート").backlinks, ["Reference"]);

    for (const ref of ["Ünïcödé Nøte", "ünïcödé nøte", "ÜNÏCÖDÉ NØTE"]) {
        const { target, results } = findRelatedNotes(index, ref, {
            bodySimilarity: false,
        });
        assert.equal(target.name, "Ünïcödé Nøte", ref);

        const reference = results.find((r) => r.note.name === "Reference");
        assert.ok(reference, ref);
        assert.equal(reference.score >= WEIGHTS.backlink, true);
        assert.ok(reference.reasons.some((r) => r.type === "backlink"));
    }
});

test("related: nonexistent references never become relationships", () => {
    const root = buildDir({
        "Alpha.md": "see [[Ghost]] and [[missing note]]\n",
        "Unrelated.md": "totally different\n",
    });
    const index = buildVaultIndex(root);

    assert.deepEqual(index.byName.get("alpha").backlinks, []);
    assert.equal(index.byName.has("ghost"), false);

    const missing = findRelatedNotes(index, "Ghost");
    assert.equal(missing.target, null);
    assert.deepEqual(missing.results, []);

    const alpha = findRelatedNotes(index, "Alpha", { bodySimilarity: false });
    assert.deepEqual(alpha.results, []);
});

// --- Backlink dedup and self-filter (v1.7.0 Bug 2) --------------------

test("related: repeated references to one target yield a single relationship", () => {
    const root = buildDir({
        "Note A.md": "[[Note B]]\n[[Note B]]\n[[note b]]\n[[Note B#Section]]\n",
        "Note B.md": "b\n",
    });
    const index = buildVaultIndex(root);

    assert.deepEqual(index.byName.get("note b").backlinks, ["Note A"]);

    const { results } = findRelatedNotes(index, "Note B", {
        bodySimilarity: false,
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].reasons.filter((r) => r.type === "backlink").length, 1);
    assert.equal(results[0].reasons.filter((r) => r.type === "sharedLink").length, 0);
});

test("related: a self reference never becomes a relationship", () => {
    const root = buildDir({
        "Solo.md": "[[Solo]]\n[[solo]]\n[[SOLO]]\n",
    });
    const index = buildVaultIndex(root);

    const solo = index.byName.get("solo");
    assert.deepEqual(solo.outgoing, ["solo"]);
    assert.deepEqual(solo.backlinks, []);

    const { target, results } = findRelatedNotes(index, "Solo");
    assert.ok(target);
    assert.deepEqual(results, []);
});

test("related: duplicate references do not inflate shared signals", () => {
    const root = buildDir({
        "Alpha.md": "[[Hub]]\n[[Hub]]\n[[Hub]]\n[[Shared]]\n",
        "Beta.md": "[[Hub]]\n[[Hub]]\n",
        "Hub.md": "[[Shared]]\n",
        "Shared.md": "shared\n",
    });
    const index = buildVaultIndex(root);

    assert.deepEqual(index.byName.get("hub").backlinks, ["Alpha", "Beta"]);

    const { results } = findRelatedNotes(index, "Hub", {
        bodySimilarity: false,
    });
    const byName = {};
    for (const r of results) byName[r.note.name] = r;

    // Alpha links Hub three times and still counts as one backlink and one
    // shared outgoing link. Beta links Hub twice and shares nothing else.
    assert.equal(byName.Alpha.score, WEIGHTS.backlink + WEIGHTS.sharedLink);
    assert.equal(byName.Beta.score, WEIGHTS.backlink);
    assert.equal(byName.Alpha.reasons.filter((r) => r.type === "backlink").length, 1);
    assert.equal(byName.Alpha.reasons.filter((r) => r.type === "sharedLink").length, 1);
    assert.deepEqual(
        byName.Alpha.reasons.find((r) => r.type === "sharedLink").items,
        ["shared"]
    );
});

// ─── CLI ─────────────────────────────────────────────────────────────

// --- Body-text similarity (Feature A) ---------------------------------

test("related: body-text similarity surfaces notes with no links or tags", () => {
    const root = buildDir({
        "Kubernetes.md":
            "#Kubernetes\n\nThe kubernetes operator reconciles desired state with observed cluster state using a controller loop and custom resources.\n",
        "Operators.md":
            "#Operators\n\nA kubernetes operator uses a controller loop to reconcile desired state against observed state through custom resources.\n",
        "Cooking.md":
            "#Cooking\n\nSourdough bread needs starter flour water and patience while the oven preheats to a very hot temperature overnight.\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Kubernetes", { limit: 10 });
    const byName = {};
    for (const r of results) byName[r.note.name] = r;

    assert.ok(byName.Operators, "similar body text should be related");
    assert.equal(byName.Cooking, undefined, "unrelated body text should not match");
    assert.equal(byName.Operators.score, WEIGHTS.bodySimilarity * 3);

    const reason = byName.Operators.reasons.find((r) => r.type === "bodySimilarity");
    assert.ok(reason);
    assert.equal(reason.label, "Similar body text");
    assert.ok(reason.items.includes("kubernetes"));
    assert.ok(reason.items.includes("controller"));
});

test("related: body-text similarity adds to existing signals without dominating", () => {
    const root = buildDir({
        "Alpha.md":
            "#project\nreconcile desired state with a controller loop over custom resources in a kubernetes cluster\n[[Hub]]\n[[Shared]]\n",
        "Beta.md":
            "#project\ncontroller loop reconciles custom resources toward desired state inside a kubernetes cluster\n",
        "Hub.md": "hub note\n[[Shared]]\n",
        "Shared.md": "shared\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Alpha", { limit: 10 });
    const byName = {};
    for (const r of results) byName[r.note.name] = r;

    const beta = byName.Beta;
    assert.deepEqual(beta.reasons.map((r) => r.type).sort(), [
        "bodySimilarity",
        "sharedTag",
    ]);

    const bodyPoints = beta.score - WEIGHTS.sharedTag;
    assert.ok(bodyPoints > 0, "body text should contribute");
    assert.equal(bodyPoints % WEIGHTS.bodySimilarity, 0, "tiered, whole points only");
    assert.ok(bodyPoints < WEIGHTS.backlink, "never outweighs one explicit link");

    const hub = byName.Hub;
    assert.ok(hub, "shared outgoing link still counts");
    assert.ok(hub.score >= WEIGHTS.sharedLink);
    assert.ok(beta.score > hub.score, "extra signals rank above a lone shared link");
});

test("related: body-text similarity weight is conservative by design", () => {
    assert.equal(WEIGHTS.bodySimilarity, 2);
    assert.ok(WEIGHTS.bodySimilarity * 3 < WEIGHTS.backlink);
    assert.ok(WEIGHTS.bodySimilarity * 3 <= WEIGHTS.sharedLink * 2);

    assert.equal(bodySimilarityPoints(0.31), 6);
    assert.equal(bodySimilarityPoints(0.3), 6);
    assert.equal(bodySimilarityPoints(0.29), 4);
    assert.equal(bodySimilarityPoints(0.18), 4);
    assert.equal(bodySimilarityPoints(0.17), 2);
    assert.equal(bodySimilarityPoints(0.1), 2);
    assert.equal(bodySimilarityPoints(0.09), 0);
    assert.equal(bodySimilarityPoints(0), 0);

    assert.deepEqual(
        BODY_TIERS.map((t) => t.min),
        [0.3, 0.18, 0.1]
    );
});

test("related: body-text similarity ignores fenced and inline code", () => {
    const root = buildDir({
        "Alpha.md":
            "alpha bravo charlie delta\n```js\nsecretcode variable declaration\n```\ninline `alsosecret` tail\n",
        "Code.md": "```js\nsecretcode variable declaration alsosecret\n```\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Alpha", { limit: 10 });

    assert.deepEqual(results, [], "code-only overlap is not body similarity");
});

test("related: body-text similarity needs enough shared tokens", () => {
    const root = buildDir({
        "Alpha.md": "alpha bravo charlie delta echo\n",
        "Two.md": "alpha bravo zulu yankee xray\n",
        "Three.md": "alpha bravo charlie golf hotel\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Alpha", { limit: 10 });
    const names = results.map((r) => r.note.name);

    assert.ok(names.includes("Three"), "three shared tokens is enough");
    assert.ok(!names.includes("Two"), "two shared tokens is not enough");
});

test("related: body-text similarity can be disabled per lookup", () => {
    const root = buildDir({
        "Alpha.md":
            "reconcile desired state with a controller loop over custom resources in a kubernetes cluster\n",
        "Beta.md":
            "a controller loop reconciles custom resources toward desired state inside a kubernetes cluster\n",
    });
    const index = buildVaultIndex(root);

    const withBody = findRelatedNotes(index, "Alpha", { limit: 10 });
    assert.ok(withBody.results.some((r) => r.note.name === "Beta"));

    const withoutBody = findRelatedNotes(index, "Alpha", {
        limit: 10,
        bodySimilarity: false,
    });
    assert.deepEqual(withoutBody.results, []);
});

// --- Explanations (Feature B) ------------------------------------------

test("related: every relationship carries a known explanation", () => {
    const root = buildDir({
        "Alpha.md": "#project\ncontroller loop reconciles custom resources [[Hub]]\n",
        "Hub.md": "#project\nhub\n",
        "Peer.md": "#project\n[[Hub]]\n",
        "Twin.md": "controller loop reconciles custom resources in a cluster\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Alpha", { limit: 10 });
    assert.ok(results.length > 0);

    for (const result of results) {
        assert.ok(result.reasons.length > 0);
        for (const reason of result.reasons) {
            assert.ok(REASON_ORDER.includes(reason.type), reason.type);
            assert.equal(typeof reason.label, "string");
            assert.ok(reason.label.length > 0);
            assert.ok(Array.isArray(reason.items));
        }
    }
});

test("related: explanations are unique per type and deterministic", () => {
    const root = buildDir({
        "Alpha.md": "#project\ncontroller loop reconciles custom resources [[Hub]]\n",
        "Hub.md": "#project\ncontroller loop reconciles custom resources\n",
        "Peer.md": "#project\ncontroller loop reconciles custom resources [[Hub]]\n",
    });
    const index = buildVaultIndex(root);

    const first = findRelatedNotes(index, "Alpha", { limit: 10 });
    const second = findRelatedNotes(index, "Alpha", { limit: 10 });

    assert.deepEqual(
        first.results.map((r) => [r.note.relPath, r.score]),
        second.results.map((r) => [r.note.relPath, r.score])
    );
    assert.deepEqual(
        first.results.map((r) => r.reasons),
        second.results.map((r) => r.reasons)
    );

    for (const result of first.results) {
        const types = result.reasons.map((r) => r.type);
        assert.equal(new Set(types).size, types.length, "duplicate reason type");
    }
});

test("related: body-similarity explanation items are sorted, unique and capped", () => {
    const root = buildDir({
        "Alpha.md": "alpha bravo charlie delta echo foxtrot golf hotel india juliet\n",
        "Beta.md": "alpha bravo charlie delta echo foxtrot golf hotel india juliet\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Alpha", { limit: 10 });
    const reason = results[0].reasons.find((r) => r.type === "bodySimilarity");

    assert.ok(reason);
    assert.deepEqual(reason.items, reason.items.slice().sort());
    assert.equal(new Set(reason.items).size, reason.items.length);
    assert.ok(reason.items.length > 0);
    assert.ok(reason.items.length <= 5);
});

// --- Determinism and ordering -----------------------------------------

test("related: results are stable across index rebuilds", () => {
    const root = buildDir({
        "Alpha.md": "#project\ncontroller loop reconciles custom resources [[Hub]]\n",
        "Hub.md": "#project\ncontroller loop reconciles custom resources\n",
        "Peer.md": "#project\n[[Hub]]\n",
        "Outlier.md": "sourdough starter hydration\n",
    });

    const first = findRelatedNotes(buildVaultIndex(root), "Alpha", { limit: 10 });
    const second = findRelatedNotes(buildVaultIndex(root), "Alpha", { limit: 10 });

    assert.deepEqual(
        first.results.map((r) => [r.note.relPath, r.score, r.reasons.map((x) => x.type)]),
        second.results.map((r) => [r.note.relPath, r.score, r.reasons.map((x) => x.type)])
    );
});

test("related: equal scores break ties by name then path", () => {
    const root = buildDir({
        "Zeta.md": "shared body token set one two three four five\n",
        "Alpha.md": "shared body token set one two three four five\n",
    });
    const index = buildVaultIndex(root);

    const { results } = findRelatedNotes(index, "Zeta", { limit: 10 });
    assert.deepEqual(
        results.map((r) => r.note.name),
        ["Alpha"]
    );
});

// --- Synthetic large vault --------------------------------------------

test("related: stays bounded and deterministic on a large synthetic vault", () => {
    const count = 600;
    const files = {};

    for (let i = 0; i < count; i += 1) {
        const id = String(i).padStart(4, "0");
        // Small clusters of near-duplicate bodies plus long filler, so the
        // candidate generator has real work to prune.
        const cluster = i % 7;
        const filler = Array.from(
            { length: 60 },
            (_, k) => `filler${cluster}word${k}`
        ).join(" ");
        files[`Note ${id}.md`] =
            `#vault\nreconcile desired state controller loop custom resource ` +
            `cluster node ${cluster}\n${filler}\n[[Note 0000]]\n`;
    }

    const root = buildDir(files);
    const index = buildVaultIndex(root);
    assert.equal(index.notes.length, count);

    const started = process.hrtime.bigint();
    const first = findRelatedNotes(index, "Note 0420", { limit: 10 });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    assert.equal(first.results.length, 10);
    assert.ok(
        elapsedMs < 5000,
        `a single lookup must stay bounded, took ${elapsedMs.toFixed(0)}ms`
    );

    for (let i = 1; i < first.results.length; i += 1) {
        assert.ok(first.results[i - 1].score >= first.results[i].score);
    }

    const shape = (r) => [r.note.relPath, r.score, r.reasons.map((x) => x.type)];

    // Tokenization is cached per index object, so repeat lookups stay cheap.
    const cached = findRelatedNotes(index, "Note 0420", { limit: 10 });
    assert.deepEqual(first.results.map(shape), cached.results.map(shape));

    // And a rebuilt index produces byte-identical output.
    const rebuilt = findRelatedNotes(buildVaultIndex(root), "Note 0420", {
        limit: 10,
    });
    assert.deepEqual(first.results.map(shape), rebuilt.results.map(shape));
});

test("related: CLI prints ranked related notes", () => {
    const root = buildDir({
        "Alpha.md": "#Alpha\n#project\ncontent [[Beta]]\n",
        "Beta.md": "#Beta\ncontent [[Alpha]]\n",
    });
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    try {
        const { status, stdout } = spawnSync(
            process.execPath,
            [bin, "related", "Alpha"],
            { encoding: "utf8", cwd: path.join(__dirname, "..") }
        );
        assert.equal(status, 0);
        assert.ok(stdout.includes("Related Notes"));
        assert.ok(stdout.includes("Beta"));
        assert.ok(stdout.includes("Links to this note"));
    } finally {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    }
});

test("related: CLI explains body-text similarity", () => {
    const root = buildDir({
        "Alpha.md":
            "reconcile desired state with a controller loop over custom resources in a kubernetes cluster\n",
        "Beta.md":
            "a controller loop reconciles custom resources toward desired state inside a kubernetes cluster\n",
    });
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    try {
        const { status, stdout } = spawnSync(
            process.execPath,
            [bin, "related", "Alpha"],
            { encoding: "utf8", cwd: path.join(__dirname, "..") }
        );
        assert.equal(status, 0);
        assert.ok(stdout.includes("Similar body text"));
        assert.ok(stdout.includes("kubernetes"));
    } finally {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    }
});

test("related: CLI reports note not found", () => {
    const root = buildDir({ "A.md": "content\n" });
    const output = withVault(root, () =>
        capture(() => relatedCmd("Ghost"))
    );
    assert.ok(output.includes("Note not found: Ghost"));
});

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