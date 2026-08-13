const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    getPreviousDate,
    addDays,
    dailyNotePath,
    extractSectionLines,
    parseChecklistItem,
    extractChecklistItems,
    normalizeTaskText,
    mergeChecklistItems,
    upsertUpdateSection,
    loadTomorrowTasks,
    importTomorrowTasks,
    TOMORROW_HEADING,
    UPDATE_HEADING,
} = require("../utils/dailyWorkflow");

function makeVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-daily-"));
    fs.mkdirSync(path.join(root, "Daily Notes"), { recursive: true });
    return root;
}

const TOMORROW_NOTE = `# 2026-08-07

## Target Hari Ini

- Kerjain laporan

## Tomorrow

- [ ] Finish relationship tests
- [ ] Update documentation
- [ ] Test Windows compatibility

## Notes

Something else entirely
- [ ] Should not be imported
`;

// --- Date helpers ---

test("getPreviousDate: returns the day before", () => {
    assert.equal(getPreviousDate("2026-08-07"), "2026-08-06");
});

test("getPreviousDate: handles month boundary", () => {
    assert.equal(getPreviousDate("2026-08-01"), "2026-07-31");
});

test("getPreviousDate: handles year boundary", () => {
    assert.equal(getPreviousDate("2026-01-01"), "2025-12-31");
});

test("addDays: shifts forward and backward", () => {
    assert.equal(addDays("2026-08-07", 1), "2026-08-08");
    assert.equal(addDays("2026-08-07", -1), "2026-08-06");
});

test("dailyNotePath: builds the Daily Notes path", () => {
    assert.equal(
        dailyNotePath("D:\\Vault", "2026-08-07"),
        path.join("D:\\Vault", "Daily Notes", "2026-08-07.md")
    );
});

// --- Section extraction ---

test("extractSectionLines: extracts the Tomorrow section", () => {
    const lines = extractSectionLines(TOMORROW_NOTE, TOMORROW_HEADING);
    assert.deepEqual(lines, [
        "",
        "- [ ] Finish relationship tests",
        "- [ ] Update documentation",
        "- [ ] Test Windows compatibility",
    ]);
});

test("extractSectionLines: stops at the next heading", () => {
    const lines = extractSectionLines(TOMORROW_NOTE, TOMORROW_HEADING);
    assert.ok(!lines.some((l) => l.includes("Something else")));
});

test("extractSectionLines: empty section returns empty array", () => {
    const content = "## Tomorrow\n\n## Notes\n";
    assert.deepEqual(extractSectionLines(content, TOMORROW_HEADING), []);
});

test("extractSectionLines: missing section returns empty array", () => {
    assert.deepEqual(extractSectionLines("# No\n\n## Notes", TOMORROW_HEADING), []);
});

// --- Checklist parsing ---

test("parseChecklistItem: parses open and checked items", () => {
    assert.deepEqual(parseChecklistItem("- [ ] Finish tests"), {
        marker: "-",
        state: " ",
        text: "Finish tests",
        raw: "- [ ] Finish tests",
    });
    assert.deepEqual(parseChecklistItem("- [x] Update docs"), {
        marker: "-",
        state: "x",
        text: "Update docs",
        raw: "- [x] Update docs",
    });
});

test("parseChecklistItem: supports star bullets and indentation", () => {
    assert.equal(parseChecklistItem("* [ ] A").text, "A");
    assert.equal(parseChecklistItem("  - [ ] B").text, "B");
});

test("parseChecklistItem: ignores plain bullets and paragraphs", () => {
    assert.equal(parseChecklistItem("- Not a checklist"), null);
    assert.equal(parseChecklistItem("Plain paragraph"), null);
    assert.equal(parseChecklistItem("## Heading"), null);
});

test("extractChecklistItems: collects only checklist lines", () => {
    const items = extractChecklistItems([
        "",
        "- [ ] Finish relationship tests",
        "- [x] Update documentation",
        "Some prose",
        "- not a task",
        "- [ ] Test Windows compatibility",
    ]);
    assert.deepEqual(items, [
        "- [ ] Finish relationship tests",
        "- [x] Update documentation",
        "- [ ] Test Windows compatibility",
    ]);
});

// --- Normalization / dedup ---

test("normalizeTaskText: trims and lowercases", () => {
    assert.equal(normalizeTaskText("  Finish  Tests  "), "finish tests");
});

test("mergeChecklistItems: deduplicates by normalized text", () => {
    const merged = mergeChecklistItems(
        ["- [ ] Finish tests"],
        ["- [ ] FINISH TESTS", "- [ ] Update docs"]
    );
    assert.deepEqual(merged, ["- [ ] Finish tests", "- [ ] Update docs"]);
});

test("mergeChecklistItems: preserves checklist state", () => {
    const merged = mergeChecklistItems(
        [],
        ["- [ ] Finish tests", "- [x] Update docs"]
    );
    assert.deepEqual(merged, ["- [ ] Finish tests", "- [x] Update docs"]);
});

// --- Update section upsert ---

test("upsertUpdateSection: appends a new Update section", () => {
    const before = "# 2026-08-07\n\n## Selesai\n";
    const { content, changed } = upsertUpdateSection(before, [
        "- [ ] Finish tests",
        "- [ ] Update docs",
    ]);
    assert.equal(changed, true);
    assert.ok(content.includes("## Update"));
    assert.ok(content.includes("- [ ] Finish tests"));
    assert.ok(content.includes("- [ ] Update docs"));
    assert.ok(content.indexOf("## Update") > content.indexOf("## Selesai"));
});

test("upsertUpdateSection: is idempotent on repeat", () => {
    const before = "# 2026-08-07\n";
    const once = upsertUpdateSection(before, ["- [ ] Finish tests"]).content;
    const twice = upsertUpdateSection(once, ["- [ ] Finish tests"]);
    assert.equal(twice.changed, false);
    assert.equal(twice.content, once);
    assert.equal((twice.content.match(/- \[ \] Finish tests/g) || []).length, 1);
});

test("upsertUpdateSection: merges into existing Update section", () => {
    const before = "## Update\n\n- [ ] Finish tests\n\n## Notes\n";
    const { content, changed } = upsertUpdateSection(before, [
        "- [ ] Update docs",
        "- [ ] finish tests",
    ]);
    assert.equal(changed, true);
    assert.equal(content, "## Update\n\n- [ ] Finish tests\n- [ ] Update docs\n\n## Notes\n");
});

test("upsertUpdateSection: preserves non-checklist prose in section", () => {
    const before = "## Update\n\n- [ ] Finish tests\n\nSome note about the day\n";
    const { content } = upsertUpdateSection(before, ["- [ ] Update docs"]);
    assert.ok(content.includes("Some note about the day"));
    assert.ok(content.includes("- [ ] Update docs"));
});

test("upsertUpdateSection: empty items leave content unchanged", () => {
    const before = "## Update\n- [ ] Finish tests\n";
    const { content, changed } = upsertUpdateSection(before, []);
    assert.equal(changed, false);
    assert.equal(content, before);
});

test("upsertUpdateSection: preserves CRLF line endings", () => {
    const before = "# 2026-08-07\r\n\r\n## Selesai\r\n";
    const { content } = upsertUpdateSection(before, ["- [ ] Finish tests"]);
    assert.ok(content.includes("\r\n"));
    assert.ok(!content.replace(/\r\n/g, "").includes("\r"));
    assert.ok(content.includes("- [ ] Finish tests"));
});

test("upsertUpdateSection: keeps CRLF when merging into an existing section", () => {
    const before = "## Update\r\n\r\n- [ ] Finish tests\r\n";
    const { content } = upsertUpdateSection(before, ["- [ ] Update docs"]);
    assert.equal(
        content,
        "## Update\r\n\r\n- [ ] Finish tests\r\n- [ ] Update docs\r\n"
    );
});

// --- importTomorrowTasks ---

test("importTomorrowTasks: no tasks returns content unchanged", () => {
    const before = "# 2026-08-07\n";
    assert.equal(importTomorrowTasks(before, []), before);
});

test("importTomorrowTasks: imports tasks into Update section", () => {
    const content = "# 2026-08-08\n";
    const updated = importTomorrowTasks(content, [
        "- [ ] Finish relationship tests",
    ]);
    assert.ok(updated.includes("## Update"));
    assert.ok(updated.includes("- [ ] Finish relationship tests"));
});

test("importTomorrowTasks: content after Tomorrow is not imported", () => {
    const tasks = extractChecklistItems(
        extractSectionLines(TOMORROW_NOTE, TOMORROW_HEADING)
    );
    assert.deepEqual(tasks, [
        "- [ ] Finish relationship tests",
        "- [ ] Update documentation",
        "- [ ] Test Windows compatibility",
    ]);
    assert.ok(!tasks.some((t) => t.includes("Should not be imported")));
});

// --- loadTomorrowTasks (file level, temp vault) ---

test("loadTomorrowTasks: reads previous daily note Tomorrow section", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Daily Notes", "2026-08-06.md"), TOMORROW_NOTE);
    const tasks = loadTomorrowTasks(root, "2026-08-07");
    assert.deepEqual(tasks, [
        "- [ ] Finish relationship tests",
        "- [ ] Update documentation",
        "- [ ] Test Windows compatibility",
    ]);
});

test("loadTomorrowTasks: missing previous note returns empty", () => {
    const root = makeVault();
    assert.deepEqual(loadTomorrowTasks(root, "2026-08-07"), []);
});

test("loadTomorrowTasks: empty Tomorrow section returns empty", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Daily Notes", "2026-08-06.md"),
        "## Tomorrow\n"
    );
    assert.deepEqual(loadTomorrowTasks(root, "2026-08-07"), []);
});

test("loadTomorrowTasks: missing Tomorrow section returns empty", () => {
    const root = makeVault();
    fs.writeFileSync(
        path.join(root, "Daily Notes", "2026-08-06.md"),
        "## Notes\nSomething\n"
    );
    assert.deepEqual(loadTomorrowTasks(root, "2026-08-07"), []);
});

// --- End to end: repeated obs update does not duplicate ---

test("end to end: repeated imports do not duplicate tasks", () => {
    const root = makeVault();
    fs.writeFileSync(path.join(root, "Daily Notes", "2026-08-06.md"), TOMORROW_NOTE);

    const todayPath = path.join(root, "Daily Notes", "2026-08-07.md");
    fs.writeFileSync(todayPath, "# 2026-08-07\n");

    const tasks = loadTomorrowTasks(root, "2026-08-07");
    const first = importTomorrowTasks(fs.readFileSync(todayPath, "utf8"), tasks);
    fs.writeFileSync(todayPath, first);

    const secondTasks = loadTomorrowTasks(root, "2026-08-07");
    const second = importTomorrowTasks(fs.readFileSync(todayPath, "utf8"), secondTasks);
    fs.writeFileSync(todayPath, second);

    const final = fs.readFileSync(todayPath, "utf8");
    assert.equal((final.match(/- \[ \] Finish relationship tests/g) || []).length, 1);
    assert.equal((final.match(/- \[ \] Update documentation/g) || []).length, 1);
    assert.equal((final.match(/- \[ \] Test Windows compatibility/g) || []).length, 1);
});

// --- Constants ---

test("UPDATE_HEADING and TOMORROW_HEADING constants", () => {
    assert.equal(TOMORROW_HEADING, "Tomorrow");
    assert.equal(UPDATE_HEADING, "Update");
});
