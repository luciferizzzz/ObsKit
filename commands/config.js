const fs = require("fs");
const path = require("path");
const { input, select, password } = require("@inquirer/prompts");

const configPath = path.join(__dirname, "..", "config.json");
const { error, info, success } = require("../utils/feedback");

function loadConfig() {
    if (!fs.existsSync(configPath)) {
        return null;
    }

    return JSON.parse(
        fs.readFileSync(configPath, "utf8")
    );
}

function saveConfig(data) {
    fs.writeFileSync(
        configPath,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

function maskKey(key) {
    if (!key) return key;
    if (key.length <= 4) return "********";
    return "********" + key.slice(-4);
}

async function setupAI(cfg) {
    const provider = await select({
        message: "Pilih provider AI:",
        choices: [
            { name: "Ollama (LLM lokal di komputer kamu)", value: "ollama" },
            { name: "OpenAI / API key (cloud atau server OpenAI-compatible)", value: "openai" },
        ],
    });

    const ai = cfg.ai || {};
    ai.provider = provider;

    if (provider === "ollama") {
        const url = await input({
            message: "URL Ollama:",
            default: "http://127.0.0.1:11434",
        });
        const model = await input({
            message: "Model Ollama:",
            default: "qwen2.5-coder:7b",
        });
        ai.ollama = {
            url: url.trim() || "http://127.0.0.1:11434",
            model: model.trim() || "qwen2.5-coder:7b",
        };
    } else {
        const apiKey = await password({
            message: "API key / token:",
            mask: "*",
        });
        const model = await input({
            message: "Model:",
            default: "gpt-4o-mini",
        });
        const baseUrl = await input({
            message: "Base URL:",
            default: "https://api.openai.com/v1",
        });
        ai.openai = {
            apiKey: apiKey.trim() || undefined,
            model: model.trim() || "gpt-4o-mini",
            baseUrl: baseUrl.trim() || "https://api.openai.com/v1",
        };
    }

    cfg.ai = ai;

    saveConfig(cfg);

    success("Konfigurasi AI berhasil disimpan.");
}

async function config(subcommand) {

    let cfg = loadConfig();

    if (!cfg) {
        error("No configuration found.");
        info("Run `obs init` first.");
        return;
    }

    switch (subcommand) {

        case "show":

            const display = JSON.parse(JSON.stringify(cfg));
            if (display.ai?.openai?.apiKey) {
                display.ai.openai.apiKey = maskKey(display.ai.openai.apiKey);
            }

            console.log(
                JSON.stringify(display, null, 2)
            );
            return;

        case "set":

            const vault = (await input({
                message: "New vault path:"
            })).trim();

            if (!vault || !fs.existsSync(vault)) {
                error("Invalid path.");
                return;
            }

            cfg.vault = vault;

            saveConfig(cfg);

            success("Vault updated.");
            return;

        case "ai":
            await setupAI(cfg);
            return;

        case "reset":

            saveConfig({
                vault: ""
            });

            success("Configuration reset.");
            return;

        default:

            console.log("Current Configuration");
            console.log("----------------------");
            console.log("Vault   :", cfg.vault || "(not configured)");

            if (cfg.ai?.provider === "openai") {
                console.log("AI      : OpenAI (API key) —", cfg.ai.openai?.model || "gpt-4o-mini");
            } else {
                console.log("AI      : Ollama —", cfg.ai?.ollama?.model || "qwen2.5-coder:7b");
            }
    }

}

module.exports = config;
