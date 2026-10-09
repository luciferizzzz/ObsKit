const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const templateAction = require("../commands/template");

const TEMPLATE_DIR = path.join(__dirname, "..", "templates");
const MANIFEST_PATH = path.join(TEMPLATE_DIR, "manifest.json");

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STANDARD_METADATA = [
    "**Tanggal:** {{date}}",
    "**Dibuat:** {{created}}",
    "**Diperbarui:** {{updated}}",
];
const CLOSING_HEADINGS = new Set(["Catatan", "Related", "Catatan Interaksi"]);
const SPECIAL_TEMPLATES = new Set(["daily"]);

function readTemplate(name) {
    return fs.readFileSync(path.join(TEMPLATE_DIR, `${name}.md`), "utf8");
}

function templateFiles() {
    return fs
        .readdirSync(TEMPLATE_DIR)
        .filter((file) => file.endsWith(".md"))
        .map((file) => file.replace(/\.md$/, ""))
        .sort();
}

function loadManifest() {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
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

function headings(content, level) {
    const prefix = "#".repeat(level);
    return content
        .split(/\r?\n/)
        .filter((line) => line.startsWith(`${prefix} `))
        .map((line) => line.slice(prefix.length + 1).trim());
}

test("manifest: parses with categories and templates", () => {
    const manifest = loadManifest();
    assert.ok(Array.isArray(manifest.categories), "categories is an array");
    assert.ok(Array.isArray(manifest.templates), "templates is an array");
    assert.ok(manifest.categories.length > 0, "at least one category");
    assert.ok(manifest.templates.length > 0, "at least one template");
});

test("manifest: category ids and labels are valid and unique", () => {
    const manifest = loadManifest();
    const ids = manifest.categories.map((category) => category.id);
    assert.equal(new Set(ids).size, ids.length, "category ids are unique");

    for (const category of manifest.categories) {
        assert.match(category.id, SLUG_RE, `category id: ${category.id}`);
        assert.ok(
            typeof category.label === "string" && category.label.trim().length > 0,
            `category label: ${category.id}`
        );
        assert.ok(!category.label.includes("\n"), `label is one line: ${category.id}`);
        assert.ok(category.label.length <= 40, `label is short: ${category.id}`);
    }
});

test("manifest: template entries are valid", () => {
    const manifest = loadManifest();
    const categoryIds = new Set(manifest.categories.map((category) => category.id));
    const names = manifest.templates.map((entry) => entry.name);

    assert.equal(new Set(names).size, names.length, "template names are unique");

    for (const entry of manifest.templates) {
        assert.match(entry.name, SLUG_RE, `template name: ${entry.name}`);
        assert.ok(categoryIds.has(entry.category), `category exists: ${entry.name}`);
        assert.ok(
            typeof entry.description === "string" && entry.description.trim().length > 0,
            `description present: ${entry.name}`
        );
        assert.ok(!entry.description.includes("\n"), `description is one line: ${entry.name}`);
        assert.ok(entry.description.length <= 100, `description is short: ${entry.name}`);
    }
});

test("manifest: covers every template file, and nothing else", () => {
    const manifest = loadManifest();
    const files = templateFiles();
    const entries = manifest.templates.map((entry) => entry.name);

    for (const file of files) {
        assert.ok(entries.includes(file), `file missing from manifest: ${file}`);
    }
    for (const entry of entries) {
        assert.ok(files.includes(entry), `manifest entry has no file: ${entry}`);
    }
    assert.equal(entries.length, files.length, "entry count matches file count");
});

test("manifest: every category holds at least one template", () => {
    const manifest = loadManifest();
    for (const category of manifest.categories) {
        const count = manifest.templates.filter(
            (entry) => entry.category === category.id
        ).length;
        assert.ok(count > 0, `empty category: ${category.id}`);
    }
});

test("structure: every template follows the standard skeleton", () => {
    for (const name of templateFiles()) {
        const raw = readTemplate(name);
        const lines = raw.split(/\r?\n/);
        const firstLine = lines[0];

        if (name === "daily") {
            assert.match(firstLine, /^# \{\{date\}\}$/, `${name}: daily title`);
        } else {
            assert.match(firstLine, /^# \{\{title\}\}$/, `${name}: title heading`);
        }

        for (const piece of STANDARD_METADATA) {
            assert.ok(raw.includes(piece), `${name}: metadata ${piece}`);
        }

        const separator = lines.indexOf("---");
        const firstSection = lines.findIndex((line) => line.startsWith("## "));
        assert.ok(separator > 0, `${name}: metadata separator exists`);
        assert.ok(
            firstSection > separator,
            `${name}: separator comes before the first section`
        );

        if (!SPECIAL_TEMPLATES.has(name)) {
            assert.ok(raw.includes("**Tags:** {{tags}}"), `${name}: tags line`);
        }
    }
});

test("structure: sections are present, unique, and well closed", () => {
    for (const name of templateFiles()) {
        const raw = readTemplate(name);
        const sections = headings(raw, 2);

        assert.ok(sections.length >= 3, `${name}: at least three sections`);
        assert.equal(
            new Set(sections).size,
            sections.length,
            `${name}: section headings are unique`
        );
        for (const section of sections) {
            assert.ok(section.length > 0, `${name}: empty section heading`);
        }

        if (SPECIAL_TEMPLATES.has(name)) continue;
        assert.ok(
            CLOSING_HEADINGS.has(sections[sections.length - 1]),
            `${name}: ends with a closing section, got: ${sections[sections.length - 1]}`
        );
    }
});

test("structure: whitespace and line endings are clean", () => {
    for (const name of templateFiles()) {
        const raw = readTemplate(name);
        const lines = raw.split(/\r?\n/);

        for (const line of lines) {
            assert.equal(line, line.replace(/[ \t]+$/, ""), `${name}: trailing whitespace`);
        }

        assert.ok(!raw.includes("\n\n\n"), `${name}: no blank-line runs`);
        assert.ok(raw.endsWith("\n"), `${name}: ends with a newline`);
        assert.ok(!raw.endsWith("\n\n"), `${name}: exactly one final newline`);

        const lf = (raw.match(/\n/g) || []).length;
        const cr = (raw.match(/\r/g) || []).length;
        assert.equal(cr, lf, `${name}: uniform line endings`);
    }
});

test("cli: list shows grouped categories, descriptions, and usage hints", () => {
    const manifest = loadManifest();
    const output = capture(() => templateAction({ list: true }));

    assert.ok(
        output.includes(`Available Templates (${templateFiles().length})`),
        "count header"
    );
    for (const category of manifest.categories) {
        assert.ok(output.includes(category.label), `category label: ${category.id}`);
    }
    for (const entry of manifest.templates) {
        assert.ok(output.includes(entry.name), `template name: ${entry.name}`);
        assert.ok(
            output.includes(entry.description),
            `template description: ${entry.name}`
        );
    }
    assert.ok(output.includes("obs new -t <nama>"), "creation hint");
    assert.ok(output.includes("--preview <nama>"), "preview hint");
});

test("cli: preview shows metadata header and the template body", () => {
    const manifest = loadManifest();
    const entry = manifest.templates.find((template) => template.name === "research");
    const category = manifest.categories.find((cat) => cat.id === entry.category);

    const output = capture(() => templateAction({ preview: "research" }));

    assert.ok(output.includes("Preview: research"), "preview header");
    assert.ok(output.includes(category.label), "category label");
    assert.ok(output.includes(entry.description), "description");
    assert.ok(output.includes("Blok AI"), "AI block count");
    assert.ok(output.includes("obs new -t research"), "usage hint");
    assert.ok(output.includes("# {{title}}"), "template body");
});
