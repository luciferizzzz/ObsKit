const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const bin = path.join(__dirname, "..", "bin", "obs.js");
const { registerPersona } = require("../utils/persona");

const PROMPTS_PATH = require.resolve("@inquirer/prompts");
const AI_PATH = require.resolve("../utils/ai");
const CONFIG_PATH = require.resolve("../utils/config");
const originalPrompts = require(PROMPTS_PATH);
const originalAi = require(AI_PATH);
const originalConfig = require(CONFIG_PATH);

// ─── Helpers ─────────────────────────────────────────────────────────

function buildDir(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-interactive-"));
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return root;
}

function withVaultEnv(root) {
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    return () => {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    };
}

async function captureAsync(fn) {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.map(String).join(" "));
    try {
        await fn();
    } finally {
        console.log = original;
    }
    return logs.join("\n");
}

function exitPromptError() {
    const err = new Error("User force closed the prompt with 0 null");
    err.name = "ExitPromptError";
    return err;
}

// Loads commands/interactive.js with stubbed prompts, AI client, downstream
// commands, and/or an override of utils/config (so no real config.json is ever
// touched). `reload` lists extra relative module paths to reload fresh (e.g.
// utils/vault) so they pick up the stubbed config.
function loadInteractive({
    prompts = {},
    ai = {},
    commands = {},
    config = null,
    reload = [],
} = {}) {
    require.cache[PROMPTS_PATH].exports = { ...originalPrompts, ...prompts };
    require.cache[AI_PATH].exports = { ...originalAi, ...ai };

    const configStubbed = config !== null;

    const commandPaths = {
        "../commands/ask": commands.ask,
        "../commands/suggest": commands.suggest,
        "../commands/review": commands.review,
        "../commands/ai": commands.ai,
    };
    const reloadPaths = [
        ...Object.keys(commandPaths),
        "../commands/interactive",
        ...reload,
    ];

    for (const rel of reloadPaths) {
        delete require.cache[require.resolve(rel)];
    }

    for (const [rel, stub] of Object.entries(commandPaths)) {
        if (stub) {
            require(rel);
            require.cache[require.resolve(rel)].exports = stub;
        }
    }

    if (configStubbed) {
        require.cache[CONFIG_PATH].exports = config;
    }

    const interactive = require("../commands/interactive");

    return {
        interactive,
        restore() {
            require.cache[PROMPTS_PATH].exports = originalPrompts;
            require.cache[AI_PATH].exports = originalAi;
            if (configStubbed) {
                require.cache[CONFIG_PATH].exports = originalConfig;
            }
            for (const rel of reloadPaths) {
                delete require.cache[require.resolve(rel)];
            }
        },
    };
}

function run(args) {
    return spawnSync(process.execPath, [bin, ...args], {
        encoding: "utf8",
        cwd: path.join(__dirname, ".."),
    });
}

const RUST_VAULT = {
    "Notes/Rust Ownership.md":
        "# Rust Ownership\n\nRust ownership and borrowing explained. #rust\n",
    "Notes/Cooking.md": "# Cooking\n\nPasta recipe.\n",
};

// ─── Interactive AI question flow ────────────────────────────────────

test("interactive ask: prompts a question and reuses obs ask with the active persona", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: { input: async () => "  bagaimana rust ownership  " },
        commands: {
            ask: async (question, options) => calls.push({ question, options }),
        },
    });

    try {
        interactive.setActivePersona("default");
        await captureAsync(() => interactive.handleAiAsk());

        assert.equal(calls.length, 1);
        assert.equal(calls[0].question, "bagaimana rust ownership");
        assert.equal(calls[0].options.persona, "default");
    } finally {
        restore();
    }
});

test("interactive ask: empty question returns to the menu without dispatching", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: { input: async () => "   " },
        commands: { ask: async (...args) => calls.push(args) },
    });

    try {
        await captureAsync(() => interactive.handleAiAsk());
        assert.equal(calls.length, 0);
    } finally {
        restore();
    }
});

test("interactive ask: cancelled prompt returns safely without dispatching", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: {
            input: async () => {
                throw exitPromptError();
            },
        },
        commands: { ask: async (...args) => calls.push(args) },
    });

    try {
        await assert.doesNotReject(() => captureAsync(() => interactive.handleAiAsk()));
        assert.equal(calls.length, 0);
    } finally {
        restore();
    }
});

// ─── Persona selection ───────────────────────────────────────────────

test("interactive persona: selection is reused by subsequent AI actions", async () => {
    registerPersona({
        id: "interactive-test",
        name: "Interactive Test",
        description: "Test-only persona",
        system: "TEST SYSTEM",
    });

    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: {
            select: async () => "interactive-test",
            input: async () => "rust ownership",
        },
        commands: { ask: async (question, options) => calls.push({ question, options }) },
    });

    try {
        interactive.setActivePersona(null);
        await captureAsync(() => interactive.personaMenu());
        assert.equal(interactive.getActivePersona(), "interactive-test");
        assert.equal(interactive.resolveActivePersona().name, "Interactive Test");

        await captureAsync(() => interactive.handleAiAsk());
        assert.equal(calls.length, 1);
        assert.equal(calls[0].options.persona, "interactive-test");
    } finally {
        restore();
    }
});

test("interactive persona: back and cancel leave the selection unchanged", async () => {
    const first = loadInteractive({ prompts: { select: async () => "back" } });
    try {
        first.interactive.setActivePersona("default");
        await captureAsync(() => first.interactive.personaMenu());
        assert.equal(first.interactive.getActivePersona(), "default");
    } finally {
        first.restore();
    }

    const second = loadInteractive({
        prompts: {
            select: async () => {
                throw exitPromptError();
            },
        },
    });
    try {
        second.interactive.setActivePersona("default");
        await assert.doesNotReject(() =>
            captureAsync(() => second.interactive.personaMenu())
        );
        assert.equal(second.interactive.getActivePersona(), "default");
    } finally {
        second.restore();
    }
});

test("interactive persona: selection never persists configuration", async () => {
    let writes = 0;
    const originalWrite = fs.writeFileSync;
    fs.writeFileSync = (...args) => {
        writes++;
        return originalWrite(...args);
    };

    try {
        const { interactive, restore } = loadInteractive({
            prompts: { select: async () => "default" },
        });
        try {
            interactive.setActivePersona(null);
            await captureAsync(() => interactive.personaMenu());
            assert.equal(interactive.getActivePersona(), "default");
        } finally {
            restore();
        }
    } finally {
        fs.writeFileSync = originalWrite;
    }

    assert.equal(writes, 0);

    // Belt-and-suspenders: even a future async write path must not leave a
    // persona entry in the on-disk configuration.
    const config = require("../utils/config").getConfig() || {};
    assert.equal(Object.prototype.hasOwnProperty.call(config, "persona"), false);
});

test("interactive persona: active persona is forwarded to every AI workflow", async () => {
    const calls = [];
    const sequence = ["ask", "write", "tomorrow", "update", "weekly", "people", "back"];

    const { interactive, restore } = loadInteractive({
        prompts: {
            input: async () => "Alpha",
            select: async () => sequence.shift(),
        },
        commands: {
            ask: async (question, options) => calls.push({ fn: "ask", options }),
            ai: {
                aiWrite: async (prompt, options) =>
                    calls.push({ fn: "write", options }),
                aiTomorrow: async (options) => calls.push({ fn: "tomorrow", options }),
                aiUpdate: async (options) => calls.push({ fn: "update", options }),
                aiWeekly: async (options) => calls.push({ fn: "weekly", options }),
                aiPeople: async (name, options) =>
                    calls.push({ fn: "people", options }),
            },
        },
    });

    try {
        interactive.setActivePersona("default");
        await captureAsync(() => interactive.aiMenu());

        assert.deepEqual(
            calls.map((call) => call.fn),
            ["ask", "write", "tomorrow", "update", "weekly", "people"]
        );
        for (const call of calls) {
            assert.equal(call.options.persona, "default", `${call.fn} persona`);
        }
    } finally {
        restore();
    }
});

// ─── Smart Suggestions AI flow ───────────────────────────────────────

test("interactive suggest: confirmed AI passes --ai to obs suggest", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: { input: async () => "Alpha", confirm: async () => true },
        commands: {
            suggest: async (note, options) => calls.push({ note, options }),
        },
    });

    try {
        await captureAsync(() => interactive.handleIntelligenceSuggest());
        assert.deepEqual(calls, [{ note: "Alpha", options: { ai: true } }]);
    } finally {
        restore();
    }
});

test("interactive suggest: declined AI keeps the non-AI flow", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: { input: async () => "Alpha", confirm: async () => false },
        commands: {
            suggest: async (note, options) => calls.push({ note, options }),
        },
    });

    try {
        await captureAsync(() => interactive.handleIntelligenceSuggest());
        assert.deepEqual(calls, [{ note: "Alpha", options: { ai: false } }]);
    } finally {
        restore();
    }
});

test("interactive suggest: cancelled AI prompt returns to the menu", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: {
            input: async () => "Alpha",
            confirm: async () => {
                throw exitPromptError();
            },
        },
        commands: { suggest: async (...args) => calls.push(args) },
    });

    try {
        await captureAsync(() => interactive.handleIntelligenceSuggest());
        assert.equal(calls.length, 0);
    } finally {
        restore();
    }
});

// ─── Review AI flow ──────────────────────────────────────────────────

test("interactive review: default period with confirmed AI passes --ai", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: { input: async () => "", confirm: async () => true },
        commands: {
            review: async (period, options) => calls.push({ period, options }),
        },
    });

    try {
        await captureAsync(() => interactive.handleIntelligenceReview());
        assert.deepEqual(calls, [{ period: "week", options: { ai: true } }]);
    } finally {
        restore();
    }
});

test("interactive review: honours the period and the non-AI default", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: { input: async () => "month", confirm: async () => false },
        commands: {
            review: async (period, options) => calls.push({ period, options }),
        },
    });

    try {
        await captureAsync(() => interactive.handleIntelligenceReview());
        assert.deepEqual(calls, [{ period: "month", options: { ai: false } }]);
    } finally {
        restore();
    }
});

test("interactive review: cancelled period prompt returns to the menu", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: {
            input: async () => {
                throw exitPromptError();
            },
        },
        commands: { review: async (...args) => calls.push(args) },
    });

    try {
        await captureAsync(() => interactive.handleIntelligenceReview());
        assert.equal(calls.length, 0);
    } finally {
        restore();
    }
});

// ─── Missing AI configuration and provider failures ──────────────────

test("interactive ask: missing AI configuration is reported without throwing", async () => {
    const root = buildDir(RUST_VAULT);
    const restoreEnv = withVaultEnv(root);
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const { interactive, restore } = loadInteractive({
        prompts: { input: async () => "rust ownership" },
        ai: {
            getProvider: () => ({ provider: "openai", openai: {} }),
            generate: async () => "should not run",
        },
    });

    try {
        const output = await captureAsync(() => interactive.handleAiAsk());
        assert.ok(output.includes("API key"), output);
        assert.ok(!output.includes("should not run"));
    } finally {
        restore();
        restoreEnv();
        if (previousKey === undefined) {
            delete process.env.OPENAI_API_KEY;
        } else {
            process.env.OPENAI_API_KEY = previousKey;
        }
    }
});

test("interactive ask: provider/network failure is handled gracefully", async () => {
    const root = buildDir(RUST_VAULT);
    const restoreEnv = withVaultEnv(root);

    const { interactive, restore } = loadInteractive({
        prompts: { input: async () => "rust ownership" },
        ai: {
            getProvider: () => ({ provider: "ollama", ollama: {} }),
            generate: async () => {
                throw new Error("Gagal connect ke Ollama: ECONNREFUSED");
            },
        },
    });

    try {
        const output = await captureAsync(() => interactive.handleAiAsk());
        assert.ok(output.includes("Ollama belum jalan"), output);
    } finally {
        restore();
        restoreEnv();
    }
});

test("interactive ask: unconfigured vault returns to the menu instead of exiting", async () => {
    const previousVault = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = "";

    // Stub utils/config so the real obs ask command hits getVaultPath() without
    // touching the user's config.json. utils/vault is reloaded to pick it up.
    const { interactive, restore } = loadInteractive({
        prompts: { input: async () => "rust ownership" },
        config: { getConfig: () => null, saveConfig: () => {} },
        reload: ["../utils/vault"],
    });

    try {
        const output = await captureAsync(() => interactive.handleAiAsk());
        assert.ok(output.includes("Vault is not configured"), output);
    } finally {
        restore();
        if (previousVault === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previousVault;
        }
    }
});

test("interactive suggest: AI failure keeps suggestions and reports the error", async () => {
    const root = buildDir({ "Alpha.md": "plain content\n", "Beta.md": "plain content\n" });
    const restoreEnv = withVaultEnv(root);

    const { interactive, restore } = loadInteractive({
        prompts: { input: async () => "Alpha", confirm: async () => true },
        ai: {
            getProvider: () => ({ provider: "ollama", ollama: {} }),
            generate: async () => {
                throw new Error("Gagal connect ke Ollama: ECONNREFUSED");
            },
        },
    });

    try {
        const output = await captureAsync(() => interactive.handleIntelligenceSuggest());
        assert.ok(output.includes("Suggestions"), output);
        assert.ok(output.includes("Ollama belum jalan"), output);
    } finally {
        restore();
        restoreEnv();
    }
});

// ─── Return-to-menu behavior ─────────────────────────────────────────

test("interactive: handlers return to the menu instead of exiting", async () => {
    const { interactive, restore } = loadInteractive({
        prompts: {
            select: async () => "back",
            input: async () => "",
            confirm: async () => false,
        },
        commands: {
            suggest: async () => {},
            review: async () => {},
        },
    });

    try {
        await assert.doesNotReject(() =>
            captureAsync(() => interactive.handleAiAsk())
        );
        await assert.doesNotReject(() =>
            captureAsync(() => interactive.handleIntelligenceSuggest())
        );
        await assert.doesNotReject(() =>
            captureAsync(() => interactive.handleIntelligenceReview())
        );
        await assert.doesNotReject(() => captureAsync(() => interactive.aiMenu()));
        await assert.doesNotReject(() =>
            captureAsync(() => interactive.personaMenu())
        );
    } finally {
        restore();
    }
});

// ─── CLI / non-interactive regression ────────────────────────────────

test("interactive: module still exports the launcher plus test hooks", () => {
    const interactive = require("../commands/interactive");
    assert.equal(typeof interactive, "function");
    assert.equal(typeof interactive.handleAiAsk, "function");
    assert.equal(typeof interactive.handleIntelligenceSuggest, "function");
    assert.equal(typeof interactive.handleIntelligenceReview, "function");
    assert.equal(typeof interactive.personaMenu, "function");
    assert.equal(typeof interactive.isPromptCancel, "function");
});

test("interactive CLI: AI flags are still parsed by the non-interactive commands", () => {
    const askHelp = run(["ask", "--help"]);
    assert.equal(askHelp.status, 0);
    assert.ok(askHelp.stdout.includes("--persona"));
    assert.ok(askHelp.stdout.includes("--limit"));

    const suggestHelp = run(["suggest", "--help"]);
    assert.equal(suggestHelp.status, 0);
    assert.ok(suggestHelp.stdout.includes("--ai"));

    const reviewHelp = run(["review", "--help"]);
    assert.equal(reviewHelp.status, 0);
    assert.ok(reviewHelp.stdout.includes("--ai"));

    const aiHelp = run(["ai", "--help"]);
    assert.equal(aiHelp.status, 0);
    assert.ok(aiHelp.stdout.includes("persona"));
});

test("interactive CLI: existing commands and no-arg launch are unchanged", () => {
    assert.equal(run([]).status, 0);
    assert.equal(run(["--help"]).status, 0);
    assert.equal(run(["template", "--list"]).status, 0);

    const unknown = run(["zzzz"]);
    assert.notEqual(unknown.status, 0);
});
