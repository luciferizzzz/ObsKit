const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    parseTemplate,
    getTemplateData,
    extractAIBlocks,
    fillAIBlocks,
} = require("../utils/markdown");
const {
    INTERACTIONS_HEADING,
    MEETINGS_HEADING,
    appendInteraction,
} = require("../utils/people");
const newNote = require("../commands/new");
const today = require("../commands/today");
const templateAction = require("../commands/template");

const TEMPLATE_DIR = path.join(__dirname, "..", "templates");
const ALL_TEMPLATES = [
    "daily",
    "book",
    "project",
    "meeting",
    "article",
    "journal",
    "idea",
    "people",
    "js",
    "html",
    "css",
];

const CUSTOM_FIELDS = new Set([
    "status",
    "tags",
    "penulis",
    "rilis",
    "genre",
    "isbn",
    "peserta",
    "mood",
    "role",
    "email",
    "telepon",
    "linkedin",
]);

const DAILY_SECTIONS = [
    "Target Hari Ini",
    "Catatan",
    "Selesai",
    "Mood",
    "Syukur",
    "Refleksi",
];

const PEOPLE_SECTIONS = [
    "Informasi Dasar",
    "Kontak",
    "Kepribadian",
    "Minat",
    "Fakta Penting",
    "Topik Percakapan",
    "Hubungan",
    "Related",
    "Pertemuan",
    "Catatan Interaksi",
];

function readTemplate(name) {
    return fs.readFileSync(path.join(TEMPLATE_DIR, `${name}.md`), "utf8");
}

function leftoverPlaceholders(rendered) {
    const keys = [];
    for (const match of rendered.matchAll(/\{\{\s*([^:}]+)(?::[^}]*)?\s*\}\}/g)) {
        keys.push(match[1].trim());
    }
    return keys;
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

function makeVault(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sectionOrder(content, headings) {
    const positions = headings.map((h) => content.indexOf(`## ${h}`));
    for (const p of positions) {
        if (p < 0) return false;
    }
    for (let i = 1; i < positions.length; i++) {
        if (positions[i] <= positions[i - 1]) return false;
    }
    return true;
}

test("all built-in templates exist", () => {
    for (const name of ALL_TEMPLATES) {
        assert.ok(
            fs.existsSync(path.join(TEMPLATE_DIR, `${name}.md`)),
            `missing template: ${name}`
        );
    }
});

test("every template starts with a title heading", () => {
    for (const name of ALL_TEMPLATES) {
        const firstLine = readTemplate(name).trim().split(/\r?\n/)[0];
        assert.match(firstLine, /^# \{\{(?:title|date)\}\}$/, `template: ${name}`);
    }
});

test("every template uses the standard metadata placeholders", () => {
    for (const name of ALL_TEMPLATES) {
        const raw = readTemplate(name);
        assert.ok(raw.includes("**Tanggal:** {{date}}"), `${name}: Tanggal`);
        assert.ok(raw.includes("**Dibuat:** {{created}}"), `${name}: created`);
        assert.ok(raw.includes("**Diperbarui:** {{updated}}"), `${name}: updated`);
        if (name === "daily") {
            assert.ok(raw.includes("**Folder:** Daily Notes"), `${name}: daily folder`);
        } else {
            assert.ok(raw.includes("**Folder:** {{folder}}"), `${name}: folder`);
        }
    }
});

test("every template renders with no unknown placeholders left behind", () => {
    for (const name of ALL_TEMPLATES) {
        const rendered = parseTemplate(
            readTemplate(name),
            getTemplateData({ title: "Test", folder: "Notes", date: "2026-08-14" })
        );
        const unknown = leftoverPlaceholders(rendered).filter(
            (key) => key !== "ai" && !CUSTOM_FIELDS.has(key)
        );
        assert.deepEqual(unknown, [], `template: ${name}`);
    }
});

test("every AI block can be extracted and filled back", () => {
    for (const name of ALL_TEMPLATES) {
        const raw = readTemplate(name);
        const blocks = extractAIBlocks(raw);
        const fills = blocks.map((b) => ({
            placeholder: b.placeholder,
            content: "Filled content.",
        }));
        const filled = fillAIBlocks(raw, fills);
        assert.ok(!filled.includes("{{ai"), `template: ${name}`);
    }
});

test("templates with custom fields only use documented fields", () => {
    for (const name of ALL_TEMPLATES) {
        const raw = readTemplate(name);
        for (const key of leftoverPlaceholders(raw)) {
            if (key === "ai") continue;
            assert.ok(CUSTOM_FIELDS.has(key) || ["title", "date", "day", "time", "folder", "created", "updated"].includes(key),
                `${name}: undocumented field {{${key}}}`);
        }
    }
});

test("daily template keeps the six AI workflow sections in order", () => {
    const raw = readTemplate("daily");
    assert.ok(sectionOrder(raw, DAILY_SECTIONS), "six sections must appear in order");
    assert.ok(raw.includes("Jam dibuat"), "daily keeps the Jam dibuat footer token");
});

test("daily template renders via parseTemplate for obs today", () => {
    const rendered = parseTemplate(
        readTemplate("daily"),
        getTemplateData({ title: "2026-08-14", folder: "Daily Notes", date: "2026-08-14" })
    );
    for (const section of DAILY_SECTIONS) {
        assert.ok(rendered.includes(`## ${section}`), `missing: ${section}`);
    }
    assert.ok(!rendered.includes("{{created}}"), "created replaced");
    assert.ok(!rendered.includes("{{updated}}"), "updated replaced");
});

test("people template covers the obs ai people workflow sections", () => {
    const raw = readTemplate("people");
    for (const section of PEOPLE_SECTIONS) {
        assert.ok(raw.includes(`## ${section}`), `missing: ${section}`);
    }
    assert.ok(raw.includes(`## ${INTERACTIONS_HEADING}`), "INTERACTIONS_HEADING present");
    assert.ok(raw.includes(`## ${MEETINGS_HEADING}`), "MEETINGS_HEADING present");
});

test("people template works with appendInteraction after rendering", () => {
    const rendered = parseTemplate(
        readTemplate("people"),
        getTemplateData({ title: "John Doe", folder: "People" })
    );
    const { content, changed, added } = appendInteraction(rendered, [
        "- Met John about the API design.",
    ]);
    assert.equal(changed, true);
    assert.deepEqual(added, ["- Met John about the API design."]);
    assert.ok(content.includes("- Met John about the API design."));
    assert.ok(content.includes("## Informasi Dasar"));
    assert.ok(content.includes(`## ${INTERACTIONS_HEADING}`));
});

test("obs new -t renders a template into a note", () => {
    const root = makeVault("obs-tpl-new-");
    const filePath = path.join(root, "People", "Jane Doe.md");

    withVault(root, () =>
        capture(() => newNote("People", "Jane Doe", { template: "people" }))
    );

    assert.ok(fs.existsSync(filePath), "note created");
    const content = fs.readFileSync(filePath, "utf8");
    assert.ok(content.startsWith("# Jane Doe\n"));
    assert.ok(content.includes("## Informasi Dasar"));
    assert.ok(content.includes(`## ${INTERACTIONS_HEADING}`));
    assert.ok(content.includes("**Tanggal:**"));
    assert.ok(!content.includes("{{title}}"), "title replaced");
});

test("obs today creates the daily note from the daily template", () => {
    const root = makeVault("obs-tpl-today-");
    const now = new Date();
    const date =
        `${now.getFullYear()}-` +
        `${String(now.getMonth() + 1).padStart(2, "0")}-` +
        `${String(now.getDate()).padStart(2, "0")}`;
    const filePath = path.join(root, "Daily Notes", `${date}.md`);

    withVault(root, () => capture(() => today()));

    assert.ok(fs.existsSync(filePath), "daily note created");
    const content = fs.readFileSync(filePath, "utf8");
    for (const section of DAILY_SECTIONS) {
        assert.ok(content.includes(`## ${section}`), `missing: ${section}`);
    }
    assert.ok(content.includes("Jam dibuat"));
});

test("obs template --list reports all built-in templates", () => {
    const output = capture(() => templateAction({ list: true }));
    for (const name of ALL_TEMPLATES) {
        assert.ok(output.includes(name), `list should include ${name}`);
    }
});
