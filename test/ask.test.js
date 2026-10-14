const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const bin = path.join(__dirname, "..", "bin", "obs.js");

// ─── Helpers ─────────────────────────────────────────────────────────

function buildDir(files, prefix = "obs-ask-") {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return root;
}

async function withVaultAsync(root, fn) {
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    try {
        return await fn();
    } finally {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    }
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

function hashTree(root) {
    const hashes = new Map();

    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else {
                const digest = crypto
                    .createHash("sha256")
                    .update(fs.readFileSync(full))
                    .digest("hex");
                hashes.set(path.relative(root, full).split(path.sep).join("/"), digest);
            }
        }
    }

    walk(root);
    return hashes;
}

// Loads commands/ask.js with a stubbed utils/ai so no real provider is hit.
function loadAskCommand(aiStub = {}) {
    const aiPath = require.resolve("../utils/ai");
    const original = require(aiPath);
    require.cache[aiPath].exports = { ...original, ...aiStub };

    const commandPath = require.resolve("../commands/ask");
    delete require.cache[commandPath];

    return {
        command: require(commandPath),
        restore() {
            require.cache[aiPath].exports = original;
            delete require.cache[commandPath];
        },
    };
}

function run(args, env = {}) {
    return spawnSync(process.execPath, [bin, ...args], {
        encoding: "utf8",
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, ...env },
    });
}

const RUST_VAULT = {
    "Notes/Rust Ownership.md":
        "# Rust Ownership\n\nRust ownership and borrowing explained. #rust\n",
    "Notes/Cooking.md": "# Cooking\n\nPasta recipe.\n",
};

// ─── AI availability ─────────────────────────────────────────────────

test("ask: aiAvailability accepts ollama and rejects unknown providers", async () => {
    const { command, restore } = loadAskCommand();
    try {
        assert.deepEqual(command.aiAvailability({ provider: "ollama" }), { ok: true });
        assert.equal(command.aiAvailability({ provider: "nope" }).ok, false);
    } finally {
        restore();
    }
});

test("ask: aiAvailability rejects openai without a key but accepts one", async () => {
    const { command, restore } = loadAskCommand();
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
        const missing = command.aiAvailability({ provider: "openai", openai: {} });
        assert.equal(missing.ok, false);
        assert.ok(missing.message.includes("API key"));

        const present = command.aiAvailability({
            provider: "openai",
            openai: { apiKey: "sk-secret" },
        });
        assert.deepEqual(present, { ok: true });

        // The key must never appear in the returned structure or message.
        assert.ok(!JSON.stringify(present).includes("sk-secret"));
        assert.ok(!JSON.stringify(missing).includes("sk-secret"));
    } finally {
        if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
        restore();
    }
});

// ─── Validation ──────────────────────────────────────────────────────

test("ask: rejects an empty question without touching the vault", async () => {
    const calls = [];
    const { command, restore } = loadAskCommand({
        generate: async (prompt) => {
            calls.push(prompt);
            return "should not run";
        },
        getProvider: () => ({ provider: "ollama" }),
    });

    try {
        const output = await captureAsync(() => command("   ", {}));
        assert.ok(output.includes("kosong"));
        assert.equal(calls.length, 0);
    } finally {
        restore();
    }
});

// ─── Insufficient context ────────────────────────────────────────────

test("ask: reports insufficient context and never calls the AI", async () => {
    const root = buildDir(RUST_VAULT);
    const calls = [];
    const { command, restore } = loadAskCommand({
        generate: async (prompt) => {
            calls.push(prompt);
            return "nope";
        },
        getProvider: () => ({ provider: "ollama" }),
    });

    try {
        const output = await withVaultAsync(root, () =>
            captureAsync(() => command("zebra xylophone", {}))
        );
        assert.ok(output.includes("tidak cukup"));
        assert.equal(calls.length, 0);
    } finally {
        restore();
    }
});

// ─── Grounded answer + attribution ───────────────────────────────────

test("ask: answers from sources, attributes them, and grounds the prompt", async () => {
    const root = buildDir(RUST_VAULT);
    const prompts = [];
    const { command, restore } = loadAskCommand({
        generate: async (prompt) => {
            prompts.push(prompt);
            return "Rust memakai ownership buat ngatur memori.";
        },
        getProvider: () => ({ provider: "ollama", ollama: {} }),
    });

    try {
        const output = await withVaultAsync(root, () =>
            captureAsync(() => command("bagaimana rust ownership", {}))
        );

        assert.ok(output.includes("Sources"));
        assert.ok(output.includes("Notes/Rust Ownership.md"));
        assert.ok(output.includes("Answer"));
        assert.ok(output.includes("Rust memakai ownership buat ngatur memori."));

        assert.equal(prompts.length, 1);
        const prompt = prompts[0];
        assert.ok(prompt.includes("bagaimana rust ownership"));
        assert.ok(prompt.includes("Notes/Rust Ownership.md")); // source identity in context
        assert.ok(prompt.includes("Konteks:"));
        assert.ok(prompt.includes("HANYA berdasarkan konteks"));
    } finally {
        restore();
    }
});

// ─── Failure handling ────────────────────────────────────────────────

test("ask: handles AI client failure gracefully", async () => {
    const root = buildDir(RUST_VAULT);
    const { command, restore } = loadAskCommand({
        generate: async () => {
            throw new Error("Gagal connect ke Ollama: ECONNREFUSED");
        },
        getProvider: () => ({ provider: "ollama" }),
    });

    try {
        const output = await withVaultAsync(root, () =>
            captureAsync(() => command("rust ownership", {}))
        );
        assert.ok(output.includes("Ollama belum jalan"));
    } finally {
        restore();
    }
});

test("ask: refuses openai without a key and does not call the provider", async () => {
    const root = buildDir(RUST_VAULT);
    const calls = [];
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const { command, restore } = loadAskCommand({
        generate: async (prompt) => {
            calls.push(prompt);
            return "nope";
        },
        getProvider: () => ({ provider: "openai", openai: {} }),
    });

    try {
        const output = await withVaultAsync(root, () =>
            captureAsync(() => command("rust ownership", {}))
        );
        assert.ok(output.includes("API key"));
        assert.equal(calls.length, 0);
    } finally {
        if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
        restore();
    }
});

// ─── Mutation safety ─────────────────────────────────────────────────

test("ask: never mutates the vault", async () => {
    const root = buildDir(RUST_VAULT);
    const before = hashTree(root);

    const { command, restore } = loadAskCommand({
        generate: async () => "grounded answer",
        getProvider: () => ({ provider: "ollama" }),
    });

    try {
        await withVaultAsync(root, () =>
            captureAsync(() => command("rust ownership", {}))
        );
    } finally {
        restore();
    }

    const after = hashTree(root);
    assert.deepEqual([...before.entries()], [...after.entries()]);
});

// ─── CLI regression ──────────────────────────────────────────────────

test("cli: obs ask is registered and documented", () => {
    const { status, stdout } = run(["ask", "--help"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("ask <question>") || stdout.includes("Usage"));
    assert.ok(stdout.includes("persona") || stdout.includes("limit"));
});

test("cli: obs ask requires a question and exits non-zero", () => {
    const { status, stderr, stdout } = run(["ask"]);
    assert.notEqual(status, 0);
    assert.ok((stderr + stdout).toLowerCase().includes("required"));
});

test("cli: obs ask with no matching source exits cleanly without AI", () => {
    const root = buildDir(RUST_VAULT);
    const { status, stdout, stderr } = run(["ask", "zebra xylophone"], {
        OBSKIT_VAULT: root,
    });
    assert.equal(status, 0, stderr);
    assert.ok(stdout.includes("tidak cukup"));
});
