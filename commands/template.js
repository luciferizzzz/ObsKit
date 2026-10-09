const fs = require("fs");
const path = require("path");

const { error } = require("../utils/feedback");
const { isValidTemplateName } = require("../utils/markdown");
const c = require("../utils/colors");

const TEMPLATE_DIR = path.join(__dirname, "..", "templates");
const MANIFEST_PATH = path.join(TEMPLATE_DIR, "manifest.json");

const FALLBACK_CATEGORY_LABEL = "📦 Lainnya (custom)";

// Placeholders filled by getTemplateData(); everything else counts as a
// custom field the user fills in manually.
const STANDARD_PLACEHOLDERS = new Set([
    "title",
    "folder",
    "date",
    "time",
    "datetime",
    "created",
    "updated",
    "day",
    "month",
    "year",
]);

function loadManifest() {
    try {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
        if (!Array.isArray(manifest.categories) || !Array.isArray(manifest.templates)) {
            return null;
        }
        return manifest;
    } catch {
        return null;
    }
}

function listTemplateNames() {
    return fs
        .readdirSync(TEMPLATE_DIR)
        .filter((file) => file.endsWith(".md"))
        .map((file) => file.replace(/\.md$/, ""))
        .sort();
}

function findPlaceholders(content) {
    const keys = [];
    for (const match of content.matchAll(/\{\{\s*([^:}]+?)\s*\}\}/g)) {
        const key = match[1];
        if (key === "ai") continue;
        if (!keys.includes(key)) keys.push(key);
    }
    return keys;
}

function templateList() {
    const manifest = loadManifest();
    const names = listTemplateNames();
    const available = new Set(names);
    const listed = new Set();
    for (const entry of manifest ? manifest.templates : []) listed.add(entry.name);
    const others = names.filter((name) => !listed.has(name));

    console.log(`\n${c.heading(`📄 Available Templates (${names.length})`)}\n`);

    if (manifest) {
        for (const category of manifest.categories) {
            const entries = manifest.templates.filter(
                (entry) => entry.category === category.id && available.has(entry.name)
            );
            if (entries.length === 0) continue;

            const width = Math.max(...entries.map((entry) => entry.name.length));

            console.log(`${c.heading(category.label)}\n`);
            for (const entry of entries) {
                console.log(
                    `  ${c.note(entry.name.padEnd(width))}  ${c.dim(entry.description)}`
                );
            }
            console.log("");
        }
    }

    if (others.length > 0) {
        const width = Math.max(...others.map((name) => name.length));
        console.log(`${c.heading(FALLBACK_CATEGORY_LABEL)}\n`);
        for (const name of others) {
            console.log(`  ${c.note(name.padEnd(width))}`);
        }
        console.log("");
    }

    console.log(c.dim(`  Pakai: obs new -t <nama> "Judul"         buat note dari template`));
    console.log(c.dim(`         obs template --preview <nama>    lihat isi template lengkap\n`));

    return names;
}

function templatePreview(name) {
    if (!isValidTemplateName(name)) {
        error("Template tidak ditemukan.");
        return null;
    }

    const templatePath = path.join(TEMPLATE_DIR, `${name}.md`);

    if (!fs.existsSync(templatePath)) {
        error("Template tidak ditemukan.");
        return null;
    }

    const content = fs.readFileSync(templatePath, "utf8");

    console.log("\n");
    console.log(`${c.heading(`📄 Preview: ${name}`)}\n`);

    const manifest = loadManifest();
    const entry = manifest
        ? manifest.templates.find((template) => template.name === name)
        : null;
    const category = entry
        ? manifest.categories.find((cat) => cat.id === entry.category)
        : null;

    if (entry) {
        if (category) {
            console.log(`  ${"Kategori".padEnd(11)}: ${category.label}`);
        }
        console.log(`  ${"Deskripsi".padEnd(11)}: ${entry.description}`);
    }

    const customFields = findPlaceholders(content).filter(
        (key) => !STANDARD_PLACEHOLDERS.has(key)
    );
    if (customFields.length > 0) {
        console.log(
            `  ${"Field".padEnd(11)}: ${customFields.map((key) => `{{${key}}}`).join(", ")}`
        );
    }

    const aiBlocks = content.match(/\{\{\s*ai\s*:/gi) || [];
    console.log(`  ${"Blok AI".padEnd(11)}: ${aiBlocks.length}`);

    console.log(`  ${"Pakai".padEnd(11)}: ${c.value(`obs new -t ${name} "Judul Note"`)}`);
    if (aiBlocks.length > 0) {
        console.log(
            `  ${"".padEnd(11)}  ${c.value(`obs ai "<prompt>" --template ${name}`)}`
        );
    }

    console.log("\n");
    console.log(content);
    console.log("\n");

    return content;
}

function templateAction(options) {
    if (options.list) {
        return templateList();
    }

    if (options.preview) {
        return templatePreview(options.preview);
    }

    console.log(`\n${c.dim("❓ Silakan gunakan --list atau --preview <nama_template>")}`);
    console.log(c.dim(`   Contoh: obs new Notes "Judul" -t project\n`));
}

module.exports = templateAction;
