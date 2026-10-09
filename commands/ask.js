const { getVaultPath } = require("../utils/vault");
const { buildVaultIndex } = require("../utils/vaultIndex");
const {
    retrieveContext,
    buildContext,
    DEFAULT_LIMIT,
} = require("../checks/context");
const { generate, getProvider } = require("../utils/ai");
const { resolvePersona } = require("../utils/persona");
const { error, info } = require("../utils/feedback");
const { Spinner } = require("../utils/spinner");
const c = require("../utils/colors");

// Answers must be grounded in the retrieved sources, so the prompt forbids
// inventing details and tells the model how to behave when context is thin.
function buildAskPrompt(question, contextText, persona) {
    return `${persona.system}

Jawab pertanyaan berikut HANYA berdasarkan konteks catatan yang disediakan.

Aturan wajib:
- Bahasa Indonesia santai, langsung ke intinya
- JANGAN pakai kata "kamu", "anda", "kalian"
- JANGAN pembukaan kayak "Tentu", "Oke", "Baik"
- Pakai hanya fakta yang ada di konteks. Jangan mengarang detail yang tidak ada di sumber
- Kalau konteks tidak cukup, bilang terus terang bahwa info di vault belum cukup
- Bedakan fakta yang didukung sumber dari dugaan atau ketidakpastian
- Sebutkan path catatan sumber yang mendukung jawaban

Pertanyaan:
${question}

Konteks:
${contextText}`;
}

// Local-first: Ollama needs no credential, OpenAI does. The check only reads
// configuration and never performs a network request or prints the key.
function aiAvailability(providerInfo) {
    const provider = providerInfo && providerInfo.provider;

    if (provider === "ollama") {
        return { ok: true };
    }

    if (provider === "openai") {
        const openai = (providerInfo && providerInfo.openai) || {};
        const apiKey = openai.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return {
                ok: false,
                message:
                    "Belum ada API key. Jalankan `obs config ai` buat masukin token.",
            };
        }
        return { ok: true };
    }

    return {
        ok: false,
        message: `Provider AI tidak dikenal: ${provider || "(kosong)"}`,
    };
}

function handleAiError(err) {
    const msg = (err && err.message) || "Unknown error";
    if (msg.includes("connect ke Ollama") || msg.includes("ECONNREFUSED")) {
        error("Ollama belum jalan. Jalankan `ollama serve` dulu.");
    } else if (msg.includes("API key")) {
        error(msg);
    } else if (msg.includes("timeout")) {
        error("Response timeout. Coba pertanyaan yang lebih singkat.");
    } else {
        error(msg);
    }
}

function printSources(context) {
    console.log(`\n${c.heading("❓ Ask")}\n`);
    console.log(`  Question   : ${c.title(context.query)}\n`);

    console.log(`${c.heading("Sources")}\n`);
    context.notes.forEach((result, index) => {
        console.log(
            `  ${index + 1}. ${c.note(result.note.relPath)} ${c.dim(
                `(score ${result.score})`
            )}`
        );
    });

    if (context.truncated) {
        console.log(
            c.dim(
                `  … konteks dibatasi ke ${context.selectedCount} dari ` +
                    `${context.candidateCount} catatan relevan.`
            )
        );
    }
}

async function ask(question, options = {}) {
    const query = String(question || "").trim();

    if (!query) {
        error("Pertanyaan tidak boleh kosong.");
        return;
    }

    const vault = getVaultPath();
    const index = buildVaultIndex(vault);
    const limit = parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : DEFAULT_LIMIT;

    // Deterministic retrieval + context construction happen before any AI call
    // and never touch the network.
    const retrieval = retrieveContext(index, query, { limit });
    const context = buildContext(retrieval, { maxNotes: limit });

    if (!context.hasContext) {
        info(
            `Tidak ada sumber relevan untuk "${query}". Konteks tidak cukup ` +
                `untuk menjawab berdasarkan vault ini.`
        );
        return;
    }

    printSources(context);

    const availability = aiAvailability(getProvider());
    if (!availability.ok) {
        error(availability.message);
        return;
    }

    const persona = resolvePersona(options.persona);
    const prompt = buildAskPrompt(query, context.text, persona);

    console.log(`\n${c.heading("🤖 Answer")}\n`);

    const spinner = new Spinner({ text: "Menganalisis catatan..." });
    try {
        spinner.start();
        const content = await generate(prompt);
        spinner.stop();

        if (!content || !content.trim()) {
            error("AI tidak menghasilkan jawaban.");
            return;
        }

        console.log(`  ${content.trim().split("\n").join("\n  ")}`);
        console.log("");
        console.log(
            c.dim(
                `Berdasarkan ${context.selectedCount} sumber di atas. ` +
                    `Jawaban bisa kurang lengkap kalau konteks terbatas.`
            )
        );
    } catch (err) {
        spinner.stop();
        handleAiError(err);
    }
}

module.exports = ask;

module.exports.buildAskPrompt = buildAskPrompt;
module.exports.aiAvailability = aiAvailability;
module.exports.printSources = printSources;
