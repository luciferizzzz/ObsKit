const { getVaultPath } = require("../utils/vault");
const { buildVaultIndex } = require("../utils/vaultIndex");
const { buildSuggestions } = require("../checks/suggest");
const { generate } = require("../utils/ai");
const { displayFolder } = require("../utils/folders");
const { error, info } = require("../utils/feedback");
const { Spinner } = require("../utils/spinner");
const c = require("../utils/colors");

const CONTENT_EXCERPT_CHARS = 1200;

function relatedNotes(support) {
    return `${support} related note${support === 1 ? "" : "s"}`;
}

function printList(title, items) {
    console.log(`\n${c.heading(title)}\n`);

    if (items.length === 0) {
        console.log(c.dim("  None."));
        return;
    }

    for (const line of items) {
        console.log(line);
    }
}

function tagLines(tags) {
    return tags.map((item) => {
        const sources = item.sources.length ? `: ${item.sources.join(", ")}` : "";
        return `  • ${c.tag("#" + item.tag)} ${c.dim(`${relatedNotes(item.support)}${sources}`)}`;
    });
}

function folderLines(folders) {
    return folders.map((item) => {
        const signals = item.signals.length ? ` · ${item.signals.join(", ")}` : "";
        return `  • ${c.folder(displayFolder(item.folder))} ${c.dim(
            `${relatedNotes(item.support)}${signals}`
        )}`;
    });
}

function templateLines(templates) {
    return templates.map(
        (item) =>
            `  • ${c.note(item.name)} ${c.dim(`matches ${item.matched.join(", ")}`)}`
    );
}

function printRecommendations(recommendations) {
    printList("Recommended Tags", tagLines(recommendations.tags));
    printList("Recommended Folders", folderLines(recommendations.folders));
    printList("Recommended Templates", templateLines(recommendations.templates));
}

function buildSuggestPrompt(note, issues, opportunities, recommendations) {
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

    // Recommendations are additive context for the model. With nothing to
    // report the prompt stays byte-identical to the pre-v2 prompt.
    const hasRecommendations =
        recommendations &&
        (recommendations.tags.length > 0 ||
            recommendations.folders.length > 0 ||
            recommendations.templates.length > 0);

    if (hasRecommendations) {
        const tags = recommendations.tags.map((item) => "#" + item.tag);
        const folders = recommendations.folders.map((item) => item.folder);
        const templates = recommendations.templates.map((item) => item.name);
        lines.push("");
        lines.push("Recommendations (optional, not applied automatically):");
        lines.push(`- Tags: ${tags.join(", ") || "(none)"}`);
        lines.push(`- Folders: ${folders.join(", ") || "(none)"}`);
        lines.push(`- Templates: ${templates.join(", ") || "(none)"}`);
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

    const { note, issues, opportunities, recommendations } = buildSuggestions(
        vaultIndex,
        name
    );

    if (!note) {
        error(`Note not found: ${name}`);
        return;
    }

    printSuggestions(note, issues, opportunities);
    printRecommendations(recommendations);

    if (options.ai) {
        console.log(`\n${c.heading("🤖 AI Guidance")}\n`);

        const prompt = buildSuggestPrompt(note, issues, opportunities, recommendations);
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
module.exports.printRecommendations = printRecommendations;