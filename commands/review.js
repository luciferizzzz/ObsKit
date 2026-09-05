const { getVaultPath } = require("../utils/vault");
const { buildVaultIndex } = require("../utils/vaultIndex");
const {
    resolvePeriod,
    startDate,
    aggregateReview,
} = require("../checks/review");
const { generate } = require("../utils/ai");
const { error, info } = require("../utils/feedback");
const { Spinner } = require("../utils/spinner");
const c = require("../utils/colors");

const NAME_LIST_LIMIT = 15;

function formatDateKey(date) {
    return (
        `${date.getFullYear()}-` +
        `${String(date.getMonth() + 1).padStart(2, "0")}-` +
        `${String(date.getDate()).padStart(2, "0")}`
    );
}

function formatDateTime(date) {
    return (
        `${formatDateKey(date)} ` +
        `${String(date.getHours()).padStart(2, "0")}:` +
        `${String(date.getMinutes()).padStart(2, "0")}`
    );
}

function listNames(notes, limit) {
    return notes.slice(0, limit).map((note) => note.relPath);
}

function buildReviewPrompt(data, label) {
    const lines = [];

    lines.push(`Periode: ${label}`);
    lines.push(`Notes created: ${data.createdCount}`);
    lines.push(`Notes modified: ${data.modifiedCount}`);
    lines.push(`Pending tasks: ${data.pendingTasks}`);
    lines.push(`Relationships: ${data.relationships}`);
    lines.push(`Broken links: ${data.brokenLinks}`);
    lines.push(`Orphan notes created: ${data.orphansCreatedCount}`);
    lines.push("");

    const activeTags = data.activeTags.slice(0, 5);
    if (activeTags.length > 0) {
        lines.push("Most active tags:");
        activeTags.forEach(([tag, count]) => {
            lines.push(`- #${tag} (${count})`);
        });
        lines.push("");
    }

    if (data.createdCount > 0) {
        lines.push("Notes created:");
        listNames(data.created, NAME_LIST_LIMIT).forEach((name) => {
            lines.push(`- ${name}`);
        });
        lines.push("");
    }

    if (data.modifiedCount > 0) {
        lines.push("Notes modified:");
        listNames(data.modified, NAME_LIST_LIMIT).forEach((name) => {
            lines.push(`- ${name}`);
        });
        lines.push("");
    }

    return `Ringkas aktivitas knowledge base pada periode berikut dengan 3-4 poin menarik.

Aturan wajib:
- Bahasa Indonesia santai, langsung ke intinya
- JANGAN pakai kata "kamu", "anda", "kalian"
- JANGAN pembukaan kayak "Tentu", "Oke", "Baik"
- Maksimal 100 kata, gunakan bullet points

Data:
${lines.join("\n")}`;
}

function handleAiError(err) {
    const msg = err.message || "Unknown error";
    if (msg.includes("connect ke Ollama") || msg.includes("ECONNREFUSED")) {
        error("Ollama belum jalan. Jalankan `ollama serve` dulu.");
    } else if (msg.includes("API key")) {
        error(msg);
    } else {
        error(msg);
    }
}

async function review(period, options = {}) {
    const vault = getVaultPath();
    const vaultIndex = buildVaultIndex(vault);

    if (vaultIndex.notes.length === 0) {
        info("Vault kosong. Tidak ada note ditemukan.");
        return;
    }

    const { days, label } = resolvePeriod(period, options.days);
    const start = startDate(days);
    const data = aggregateReview(vaultIndex, { start, days });

    const endText = formatDateKey(new Date());
    const startText = formatDateKey(start);

    console.log(`\n${c.heading("📅 Review")}\n`);
    console.log(`  Period   : ${c.title(label)} (${startText} – ${endText})\n`);

    console.log(`${c.heading("Overview")}\n`);
    console.log(`  ${"Notes Created".padEnd(24)}= ${c.value(data.createdCount)}`);
    console.log(`  ${"Notes Modified".padEnd(24)}= ${c.value(data.modifiedCount)}`);
    console.log(`  ${"Pending Tasks".padEnd(24)}= ${c.value(data.pendingTasks)}`);
    console.log(`  ${"Relationships".padEnd(24)}= ${c.value(data.relationships)}`);
    console.log(`  ${"Broken Links".padEnd(24)}= ${c.value(data.brokenLinks)}`);
    console.log(`  ${"Orphan Notes Created".padEnd(24)}= ${c.value(data.orphansCreatedCount)}`);

    if (data.activeTags.length > 0) {
        console.log(`\n${c.heading("Most Active Tags")}\n`);

        data.activeTags.slice(0, 5).forEach(([tag, count]) => {
            console.log(`  ${c.tag("#" + tag)} ${c.dim(`(${count})`)}`);
        });
    }

    if (data.modifiedCount > 0) {
        console.log(`\n${c.heading("Recently Modified")}\n`);

        data.modified.slice(0, 10).forEach((note, i) => {
            console.log(`  ${i + 1}. ${c.note(note.relPath)}`);
            console.log(`     ${c.dim(formatDateTime(note.mtime))}`);
        });
    }

    if (data.createdCount > 0) {
        console.log(`\n${c.heading("Created In Period")}\n`);

        data.created.slice(0, 10).forEach((note, i) => {
            console.log(`  ${i + 1}. ${c.note(note.relPath)}`);
            console.log(`     ${c.dim(formatDateTime(note.created))}`);
        });
    }

    if (options.ai) {
        console.log(`\n${c.heading("🤖 AI Summary")}\n`);

        const prompt = buildReviewPrompt(data, label);
        const spinner = new Spinner({ text: "Meringkas aktivitas..." });

        try {
            spinner.start();
            const content = await generate(prompt);
            spinner.stop();
            if (!content || !content.trim()) {
                error("AI tidak menghasilkan ringkasan.");
                return;
            }
            console.log(`  ${content.trim().split("\n").join("\n  ")}`);
        } catch (err) {
            spinner.stop();
            handleAiError(err);
        }
    }
}

module.exports = review;

module.exports.buildReviewPrompt = buildReviewPrompt;