const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { buildVaultIndex } = require("../utils/vaultIndex");
const { resolvePeriod, startDate, aggregateReview } = require("../checks/review");
const { buildReviewPrompt } = require("../commands/review");

const bin = path.join(__dirname, "..", "bin", "obs.js");

function buildDir(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-review-"));
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

// ─── Period Resolution ───────────────────────────────────────────────

test("review: period names resolve to day counts and labels", () => {
    assert.equal(resolvePeriod("today").days, 1);
    assert.equal(resolvePeriod("today").label, "Today");

    assert.equal(resolvePeriod("week").days, 7);
    assert.equal(resolvePeriod("week").label, "Week");

    assert.equal(resolvePeriod("month").days, 30);
    assert.equal(resolvePeriod("month").label, "Month");

    assert.equal(resolvePeriod("").days, 7);
    assert.equal(resolvePeriod("garbage").days, 7);

    const custom = resolvePeriod(undefined, "14");
    assert.equal(custom.days, 14);
    assert.equal(custom.label, "Last 14 days");
});

test("review: startDate anchors to midnight N days back", () => {
    const start = startDate(7);
    const now = new Date();
    assert.equal(start.getHours(), 0);
    assert.equal(start.getMinutes(), 0);
    assert.equal(start.getSeconds(), 0);

    const diffMs = now.getTime() - start.getTime();
    assert.ok(diffMs >= 6 * 24 * 60 * 60 * 1000);
    assert.ok(diffMs < 7 * 24 * 60 * 60 * 1000);
});

// ─── Aggregation ─────────────────────────────────────────────────────

test("review: aggregates counts across the period", () => {
    const root = buildDir({
        "A.md": "#A\n#tag-one\ncontent [[B]]\n- [ ] task\n",
        "B.md": "#B\ncontent [[A]]\n",
        "C.md": "#C\ncontent\n",
        "D.md": "",
    });
    const index = buildVaultIndex(root);

    const start = startDate(7);
    const data = aggregateReview(index, { start, days: 7 });

    assert.equal(data.createdCount, 4);
    assert.equal(data.modifiedCount, 4);
    assert.equal(data.pendingTasks, 1);
    assert.equal(data.brokenLinks, 0);
    assert.equal(data.orphansCreatedCount, 2);

    const tags = Object.fromEntries(data.activeTags.map(([k, v]) => [k, v]));
    assert.ok(tags["tag-one"]);
});

// ─── Period Boundaries ───────────────────────────────────────────────

test("review: notes outside the period are excluded", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-review-old-"));
    fs.writeFileSync(path.join(root, "Old.md"), "#Old\ncontent\n");
    const index = buildVaultIndex(root);

    const start = new Date(new Date().getTime() - 4 * 24 * 60 * 60 * 1000);
    const startMs = start.getTime();
    const oldTime = startMs - 10 * 24 * 60 * 60 * 1000;

    index.notes[0].mtime = new Date(oldTime);
    index.notes[0].created = new Date(oldTime);

    const data = aggregateReview(index, { start, days: 7 });
    assert.equal(data.createdCount, 0);
    assert.equal(data.modifiedCount, 0);
    assert.equal(data.pendingTasks, 0);
    assert.deepEqual(data.created, []);
    assert.deepEqual(data.modified, []);
});

// ─── Pending Tasks & Broken Orphans ─────────────────────────────────

test("review: broken links inside period are counted", () => {
    const root = buildDir({
        "Home.md": "[[Ghost]]\n",
    });
    const index = buildVaultIndex(root);

    const data = aggregateReview(index, { start: startDate(7), days: 7 });
    assert.equal(data.brokenLinks, 1);
    assert.equal(data.orphansCreatedCount, 1);
});

// ─── Prompt Builder ──────────────────────────────────────────────────

test("review: AI prompt embeds counts and note names", () => {
    const root = buildDir({
        "A.md": "content\n",
    });
    const index = buildVaultIndex(root);
    const data = aggregateReview(index, { start: startDate(7), days: 7 });

    const prompt = buildReviewPrompt(data, "Week");
    assert.ok(prompt.includes("Notes created: 1"));
    assert.ok(prompt.includes("Notes modified: 1"));
    assert.ok(prompt.includes("A.md"));
});

// ─── CLI ─────────────────────────────────────────────────────────────

test("review: CLI renders overview with counts", () => {
    const root = buildDir({
        "A.md": "#A\ncontent\n- [ ] task\n",
        "B.md": "#B\ncontent [[A]]\n",
    });
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    try {
        const { status, stdout } = spawnSync(process.execPath, [bin, "review"], {
            encoding: "utf8",
            cwd: path.join(__dirname, ".."),
        });
        assert.equal(status, 0);
        assert.ok(stdout.includes("Review"));
        assert.ok(stdout.includes("Notes Created"));
        assert.ok(stdout.includes("Pending Tasks"));
        assert.ok(stdout.includes("Recently Modified"));
    } finally {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    }
});

test("review: custom --days is respected", () => {
    const root = buildDir({ "A.md": "content\n" });
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    try {
        const { status, stdout } = spawnSync(
            process.execPath,
            [bin, "review", "--days", "3"],
            { encoding: "utf8", cwd: path.join(__dirname, "..") }
        );
        assert.equal(status, 0);
        assert.ok(stdout.includes("Last 3 days"));
    } finally {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    }
});