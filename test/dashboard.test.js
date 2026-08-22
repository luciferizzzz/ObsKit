const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const dashboard = require("../commands/dashboard");
const collectVaultReport = require("../checks/vaultReport");
const { formatSize } = require("../checks/vaultReport");
const { getVaultPath } = require("../utils/vault");

const bin = path.join(__dirname, "..", "bin", "obs.js");

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

// ─── Command Registration ────────────────────────────────────────────

test("cli: dashboard command is registered", () => {
    const { status, stdout } = spawnSync(process.execPath, [bin, "dashboard"], {
        encoding: "utf8",
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, OBSKIT_VAULT: "" },
    });
    assert.equal(status, 0);
    assert.ok(stdout.includes("Dashboard"));
});

// ─── Empty Vault ─────────────────────────────────────────────────────

test("dashboard: empty vault shows empty message", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-empty-"));
    const output = withVault(root, () => capture(() => dashboard()));
    assert.ok(output.includes("Vault kosong"));
});

// ─── Normal Vault ────────────────────────────────────────────────────

test("dashboard: normal vault shows all sections", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-normal-"));
    fs.writeFileSync(path.join(root, "Home.md"), "# Home\nSome content here.\n");
    fs.writeFileSync(path.join(root, "Ideas.md"), "# Ideas\nMore content.\n");
    fs.writeFileSync(path.join(root, "Todo.md"), "# Todo\n- [ ] task one\n- [x] done task\n");

    const output = withVault(root, () => capture(() => dashboard()));

    assert.ok(output.includes("Vault Statistics"));
    assert.ok(output.includes("Knowledge Statistics"));
    assert.ok(output.includes("Productivity Statistics"));
    assert.ok(output.includes("Activity (Last 7 Days)"));
    assert.ok(output.includes("Recent Notes"));
});

// ─── Missing People Directory ────────────────────────────────────────

test("dashboard: missing People directory shows 0 people", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-nopeople-"));
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");

    const output = withVault(root, () => capture(() => dashboard()));
    assert.ok(output.includes("People"));
    assert.ok(!output.includes("Error"));
});

// ─── Missing Projects Directory ──────────────────────────────────────

test("dashboard: missing Projects directory shows 0 projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-noproj-"));
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");

    const output = withVault(root, () => capture(() => dashboard()));
    assert.ok(output.includes("Projects"));
    assert.ok(!output.includes("Error"));
});

// ─── Missing Daily Directory ─────────────────────────────────────────

test("dashboard: missing Daily Notes directory handled gracefully", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-nodaily-"));
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");

    const output = withVault(root, () => capture(() => dashboard()));
    assert.ok(!output.includes("Error"));
    assert.ok(output.includes("Dashboard"));
});

// ─── Missing Attachment Directories ──────────────────────────────────

test("dashboard: no attachments shows 0 attachments", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-noatt-"));
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");

    const output = withVault(root, () => capture(() => dashboard()));
    assert.ok(output.includes("Attachments"));
});

// ─── Correct Note Counts ─────────────────────────────────────────────

test("dashboard: vaultReport counts notes correctly", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-count-"));
    fs.writeFileSync(path.join(root, "A.md"), "one\n");
    fs.writeFileSync(path.join(root, "B.md"), "two\n");
    fs.writeFileSync(path.join(root, "C.md"), "three\n");
    fs.mkdirSync(path.join(root, "Sub"), { recursive: true });
    fs.writeFileSync(path.join(root, "Sub", "D.md"), "four\n");

    const output = withVault(root, () => capture(() => dashboard()));
    assert.ok(output.includes("4"));
});

// ─── Correct People Count ────────────────────────────────────────────

test("dashboard: counts People notes correctly", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-people-"));
    fs.mkdirSync(path.join(root, "People"), { recursive: true });
    fs.writeFileSync(path.join(root, "People", "Alice.md"), "person\n");
    fs.writeFileSync(path.join(root, "People", "Bob.md"), "person\n");
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");

    const output = withVault(root, () => capture(() => dashboard()));
    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.peopleCount, 2);
    assert.ok(output.includes("People"));
});

// ─── Correct Attachment Count ────────────────────────────────────────

test("dashboard: counts attachments correctly", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-attach-"));
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");
    fs.writeFileSync(path.join(root, "image.png"), "fake-png");
    fs.writeFileSync(path.join(root, "doc.pdf"), "fake-pdf");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.attachmentCount, 2);
});

// ─── Projects Count ──────────────────────────────────────────────────

test("dashboard: counts Projects correctly", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-projects-"));
    fs.mkdirSync(path.join(root, "Projects"), { recursive: true });
    fs.writeFileSync(path.join(root, "Projects", "Alpha.md"), "proj\n");
    fs.writeFileSync(path.join(root, "Projects", "Beta.md"), "proj\n");
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.projectsCount, 2);
});

// ─── Tasks Count ─────────────────────────────────────────────────────

test("dashboard: counts tasks correctly", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-tasks-"));
    fs.writeFileSync(path.join(root, "Todo.md"),
        "- [ ] pending one\n- [x] done one\n- [ ] pending two\n- [x] done two\n- [X] done three\n"
    );

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.pendingTasks, 2);
    assert.equal(report.completedTasks, 3);
});

// ─── Relationships Count ─────────────────────────────────────────────

test("dashboard: counts Related relationships", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-rel-"));
    fs.writeFileSync(path.join(root, "A.md"), "content\n\n## Related\n[[B]]\n[[C]]\n");
    fs.writeFileSync(path.join(root, "B.md"), "content\n");
    fs.writeFileSync(path.join(root, "C.md"), "content\n");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.relationshipsCount, 2);
});

// ─── Orphan Count ────────────────────────────────────────────────────

test("dashboard: counts orphans correctly", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-orphan-"));
    fs.writeFileSync(path.join(root, "A.md"), "[[B]]\n");
    fs.writeFileSync(path.join(root, "B.md"), "content\n");
    fs.writeFileSync(path.join(root, "C.md"), "no links\n");

    const report = withVault(root, () => collectVaultReport());
    assert.ok(report.orphanCount >= 1);
});

// ─── Unicode Filenames ───────────────────────────────────────────────

test("dashboard: handles unicode filenames", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-unicode-"));
    fs.writeFileSync(path.join(root, "日本語ノート.md"), "unicode content\n");
    fs.writeFileSync(path.join(root, "Ünlaut.md"), "german\n");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.noteCount, 2);
});

// ─── Emoji Filenames ─────────────────────────────────────────────────

test("dashboard: handles emoji filenames", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-emoji-"));
    fs.writeFileSync(path.join(root, "🚀 Launch.md"), "emoji content\n");
    fs.writeFileSync(path.join(root, "🎉 Party.md"), "celebration\n");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.noteCount, 2);
});

// ─── CRLF Files ──────────────────────────────────────────────────────

test("dashboard: handles CRLF line endings", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-crlf-"));
    fs.writeFileSync(path.join(root, "CRLF.md"), "line one\r\nline two\r\n- [ ] task\r\n");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.noteCount, 1);
    assert.equal(report.pendingTasks, 1);
});

// ─── LF Files ────────────────────────────────────────────────────────

test("dashboard: handles LF line endings", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-lf-"));
    fs.writeFileSync(path.join(root, "LF.md"), "line one\nline two\n- [x] task\n");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.noteCount, 1);
    assert.equal(report.completedTasks, 1);
});

// ─── Output Formatting ───────────────────────────────────────────────

test("dashboard: output contains section headings", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-format-"));
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");

    const output = withVault(root, () => capture(() => dashboard()));
    assert.ok(output.includes("Dashboard"));
    assert.ok(output.includes("Vault Statistics"));
    assert.ok(output.includes("Knowledge Statistics"));
    assert.ok(output.includes("Productivity Statistics"));
    assert.ok(output.includes("Activity"));
    assert.ok(output.includes("Recent Notes"));
});

test("dashboard: output includes vault path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-path-"));
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");

    const output = withVault(root, () => capture(() => dashboard()));
    assert.ok(output.includes(root));
});

test("dashboard: output includes update timestamp", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-time-"));
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");

    const output = withVault(root, () => capture(() => dashboard()));
    assert.ok(output.includes("Dashboard terakhir diperbarui"));
});

// ─── Backlinks and Wiki Links ────────────────────────────────────────

test("dashboard: counts wiki links and backlinks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-links-"));
    fs.writeFileSync(path.join(root, "A.md"), "[[B]]\n[[C]]\n");
    fs.writeFileSync(path.join(root, "B.md"), "[[A]]\n");
    fs.writeFileSync(path.join(root, "C.md"), "no links\n");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.totalLinks, 3);
    assert.ok(report.totalBacklinks >= 2);
});

// ─── Tags ────────────────────────────────────────────────────────────

test("dashboard: counts unique tags", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-tags-"));
    fs.writeFileSync(path.join(root, "A.md"), "#project #todo\n");
    fs.writeFileSync(path.join(root, "B.md"), "#project #idea\n");

    const report = withVault(root, () => collectVaultReport());
    assert.ok(report.tags.length >= 2);
});

// ─── Daily Notes ─────────────────────────────────────────────────────

test("dashboard: lists recent daily notes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-daily-"));
    fs.mkdirSync(path.join(root, "Daily Notes"), { recursive: true });
    fs.writeFileSync(path.join(root, "Daily Notes", "2026-01-15.md"), "daily\n");
    fs.writeFileSync(path.join(root, "Daily Notes", "2026-01-14.md"), "daily\n");
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");

    const report = withVault(root, () => collectVaultReport());
    assert.ok(report.recentDailyNotes.length >= 2);
    assert.ok(report.recentDailyNotes[0].name);
});

// ─── Error Handling ──────────────────────────────────────────────────

test("dashboard: getVaultPath throws when OBSKIT_VAULT is empty and no config", () => {
    const { getConfig, saveConfig } = require("../utils/config");
    const previous = process.env.OBSKIT_VAULT;
    const savedConfig = getConfig();

    process.env.OBSKIT_VAULT = "";
    saveConfig({});

    try {
        assert.throws(() => getVaultPath(), /Vault is not configured/);
    } finally {
        if (previous !== undefined) {
            process.env.OBSKIT_VAULT = previous;
        } else {
            delete process.env.OBSKIT_VAULT;
        }
        if (savedConfig) {
            saveConfig(savedConfig);
        }
    }
});

// ─── formatSize Utility ──────────────────────────────────────────────

test("formatSize: formats bytes correctly", () => {
    assert.equal(formatSize(0), "0 B");
    assert.equal(formatSize(512), "512 B");
    assert.equal(formatSize(1024), "1.0 KB");
    assert.equal(formatSize(1536), "1.5 KB");
    assert.equal(formatSize(1048576), "1.0 MB");
});

// ─── Window Paths (Windows backslash) ────────────────────────────────

test("dashboard: handles nested directories (Windows paths)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-nested-"));
    fs.mkdirSync(path.join(root, "A", "B", "C"), { recursive: true });
    fs.writeFileSync(path.join(root, "A", "B", "C", "Deep.md"), "deep\n");
    fs.writeFileSync(path.join(root, "Root.md"), "root\n");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.noteCount, 2);
});

// ─── Created Notes ───────────────────────────────────────────────────

test("dashboard: tracks created notes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-created-"));
    fs.writeFileSync(path.join(root, "A.md"), "one\n");
    fs.writeFileSync(path.join(root, "B.md"), "two\n");

    const report = withVault(root, () => collectVaultReport());
    assert.ok(report.createdNotes.length === 2);
    assert.ok(report.createdNotes[0].ctime);
});

// ─── Attachments with Hidden Dirs ────────────────────────────────────

test("dashboard: skips hidden directories for attachments", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-hidden-"));
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");
    fs.mkdirSync(path.join(root, ".obsidian"), { recursive: true });
    fs.writeFileSync(path.join(root, ".obsidian", "config.json"), "{}");
    fs.writeFileSync(path.join(root, "image.png"), "fake");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.attachmentCount, 1);
});

// ─── No People, No Projects, No Daily ────────────────────────────────

test("dashboard: all optional directories missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-allmiss-"));
    fs.writeFileSync(path.join(root, "Note.md"), "content\n");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.peopleCount, 0);
    assert.equal(report.projectsCount, 0);
    assert.equal(report.recentDailyNotes.length, 0);
    assert.equal(report.noteCount, 1);
});

// ─── Dashboard CLI Integration ───────────────────────────────────────

test("cli: dashboard with empty vault shows empty message", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-cli-empty-"));
    const { stdout } = spawnSync(process.execPath, [bin, "dashboard"], {
        encoding: "utf8",
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, OBSKIT_VAULT: root },
    });
    assert.ok(stdout.includes("Vault kosong"));
});

// ─── Related Notes Count ─────────────────────────────────────────────

test("dashboard: counts unique related notes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-relnotes-"));
    fs.writeFileSync(path.join(root, "A.md"), "# A\n\n## Related\n[[B]]\n[[B]]\n[[C]]\n");
    fs.writeFileSync(path.join(root, "D.md"), "# D\n\n## Related\n[[b#Section]]\n");
    fs.writeFileSync(path.join(root, "B.md"), "content\n");
    fs.writeFileSync(path.join(root, "C.md"), "content\n");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.relatedNotesCount, 2);
});

test("dashboard: related notes is zero without Related sections", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-norel-"));
    fs.writeFileSync(path.join(root, "A.md"), "[[B]]\n");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.relationshipsCount, 0);
    assert.equal(report.relatedNotesCount, 0);
});

// ─── Broken Markdown ─────────────────────────────────────────────────

test("dashboard: handles broken markdown without crashing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-broken-"));
    fs.writeFileSync(path.join(root, "Broken.md"), "# Head\n```\nunclosed code\n[[Weird [[Link\n- [ ]\n###\n");
    fs.writeFileSync(path.join(root, "Ok.md"), "[[Broken]]\n");

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.noteCount, 2);
});

// ─── Output Limits ───────────────────────────────────────────────────

test("dashboard: recent notes list is limited to 5", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-limit-"));
    for (let i = 1; i <= 8; i++) {
        fs.writeFileSync(path.join(root, `Note${i}.md`), `note ${i}\n`);
    }

    const output = withVault(root, () => capture(() => dashboard()));
    assert.ok(output.includes("Note8"));
    // Each list section shows at most 5 of the 8 notes
    const recentSection = output.split("Recent Notes")[1].split("Recently Created")[0] || "";
    const recentEntries = recentSection
        .split("\n")
        .filter((line) => /^\s+\d\. /.test(line));
    assert.equal(recentEntries.length, 5);
});

// ─── Sorting ─────────────────────────────────────────────────────────

test("dashboard: recent notes are sorted newest first", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-sort-"));
    const oldPath = path.join(root, "Old.md");
    const newPath = path.join(root, "New.md");
    fs.writeFileSync(oldPath, "old\n");
    fs.writeFileSync(newPath, "new\n");
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    fs.utimesSync(oldPath, past, past);

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.recent[0].path, "New.md");
    assert.equal(report.recent[1].path, "Old.md");
});

test("dashboard: created notes are sorted newest first", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-ctimesort-"));
    const a = path.join(root, "A.md");
    const b = path.join(root, "B.md");
    fs.writeFileSync(a, "a\n");
    fs.writeFileSync(b, "b\n");
    const later = new Date(Date.now() + 60 * 1000);
    fs.utimesSync(b, later, later);

    const report = withVault(root, () => collectVaultReport());
    assert.ok(report.createdNotes.length === 2);
    assert.ok(report.createdNotes[0].ctime >= report.createdNotes[1].ctime);
});

test("dashboard: daily notes are sorted newest first and limited to 5", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-dailysort-"));
    const dailyDir = path.join(root, "Daily Notes");
    fs.mkdirSync(dailyDir, { recursive: true });
    for (let d = 1; d <= 7; d++) {
        const name = `2026-08-${String(d).padStart(2, "0")}.md`;
        fs.writeFileSync(path.join(dailyDir, name), "daily\n");
        const stamp = new Date(2026, 7, d, 12, 0, 0);
        fs.utimesSync(path.join(dailyDir, name), stamp, stamp);
    }

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.recentDailyNotes.length, 5);
    assert.equal(report.recentDailyNotes[0].name, "2026-08-07");
    for (let i = 1; i < report.recentDailyNotes.length; i++) {
        assert.ok(report.recentDailyNotes[i - 1].mtime >= report.recentDailyNotes[i].mtime);
    }
});

// ─── Productivity Labels ─────────────────────────────────────────────

test("dashboard: shows task totals in productivity section", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-tasklabel-"));
    fs.writeFileSync(path.join(root, "Todo.md"), "- [ ] one\n- [x] two\n");

    const output = withVault(root, () => capture(() => dashboard()));
    assert.ok(output.includes("Today's Tasks"));
    assert.ok(output.includes("Completed"));
    assert.ok(output.includes("Pending"));
});

// ─── Large Vault ─────────────────────────────────────────────────────

test("dashboard: handles a large vault (300 notes)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-dash-large-"));
    const sub = path.join(root, "Bulk");
    fs.mkdirSync(sub, { recursive: true });
    for (let i = 0; i < 300; i++) {
        fs.writeFileSync(
            path.join(sub, `Note${String(i).padStart(4, "0")}.md`),
            `# Note ${i}\n[[Note${String((i + 1) % 300).padStart(4, "0")}]]\n- [x] done ${i}\n`
        );
    }

    const report = withVault(root, () => collectVaultReport());
    assert.equal(report.noteCount, 300);
    assert.equal(report.completedTasks, 300);
    assert.equal(report.totalLinks, 300);
    assert.equal(report.brokenCount, 0);
    assert.equal(report.orphanCount, 0);
});
