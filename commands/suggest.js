const { getVaultPath } = require("../utils/vault");
const { buildVaultIndex } = require("../utils/vaultIndex");
const { buildSuggestions } = require("../checks/suggest");
const { generate } = require("../utils/ai");
const { error, info } = require("../utils/feedback");
const { Spinner } = require("../utils/spinner");
const c = require("../utils/colors");

const CONTENT_EXCERPT_CHARS = 1200;

function buildSuggestPrompt(note, issues, opportunities) {
    const contentSnippet = note.content.slice(0, CONTENT_EXCERPT_CHARS);

    const lines = [];
    lines.push(`Note: ${note.name}`);
    lines.push(`Path: ${note.relPath}`);
    lines.push(`Tags: ${note.tags.length ? note.tags.map((t) => "#" + t).join(", ") : "(none)"}`);
    lines.push(`Outgoing links: ${note.outgoing.length ? note.outgoing.join(", ") : "(none)"}`);
    lines.push(`Backlinks: ${note.backlinks.length}`);
    lines.push(`Size: ${note.size} bytes`);
    lines.push("");
    lines.push("Issues:");
    if (issues.length === 0) {
        lines.push("- (none)");
    } else {
        issues.forEach((s) => lines.push(`- ${s.message}`));
    }
    lines.push("");
    lines.push("Opportunities:");
    if (opportunities.length === 0) {
        lines.push("- (none)");
    } else {
        opportunities.forEach((s) => lines.push(`- ${s.message}`));
    }
    lines.push("");
    lines.push("Note content excerpt:");
    lines.push("---");
    lines.push(contentSnippet);
    lines.push("---");

    return `Analisis catatan di bawah ini lalu berikan saran singkat untuk menjaganya tetap berguna.

Aturan wajib:
- Bahasa Indonesia santai, langsung ke intinya
- JANGAN pakai kata "kamu", "anda", "kalian"
- JANGAN pembukaan kayak "Tentu", "Oke", "Baik"
- Maksimal 120 kata, bisa pakai bullet points
- JANGAN menyarankan menghapus file

Data catatan:
${lines.join("\n")}`;
}

function printSuggestions(note, issues, opportunities) {
    console.log(`\n${c.heading("💡 Suggestions")}\n`);
    console.log(`  For        : ${c.note(note.relPath)}`);

    console.log(`\n${c.heading("Issues")}\n`);
    if (issues.length === 0) {
        console.log(c.dim("  None."));
    } else {
        issues.forEach((s) => {
            console.log(`  ⚠️  ${s.message}`);
        });
    }

    console.log(`\n${c.heading("Opportunities")}\n`);
    if (opportunities.length === 0) {
        console.log(c.dim("  None."));
    } else {
        opportunities.forEach((s) => {
            console.log(`  • ${s.message}`);
        });
    }
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

async function suggest(noteRef, options = {}) {
    const name = String(noteRef || "").trim();

    if (!name) {
        error("Note name is required.");
        return;
    }

    const vault = getVaultPath();
    const vaultIndex = buildVaultIndex(vault);

    const { note, issues, opportunities } = buildSuggestions(vaultIndex, name);

    if (!note) {
        error(`Note not found: ${name}`);
        return;
    }

    printSuggestions(note, issues, opportunities);

    if (options.ai) {
        console.log(`\n${c.heading("🤖 AI Guidance")}\n`);

        const prompt = buildSuggestPrompt(note, issues, opportunities);
        const spinner = new Spinner({ text: "Menganalisis catatan..." });

        try {
            spinner.start();
            const content = await generate(prompt);
            spinner.stop();
            if (!content || !content.trim()) {
                error("AI tidak menghasilkan saran.");
                return;
            }
            console.log(`  ${content.trim().split("\n").join("\n  ")}`);
        } catch (err) {
            spinner.stop();
            handleAiError(err);
        }
    }
}

module.exports = suggest;

module.exports.buildSuggestPrompt = buildSuggestPrompt;