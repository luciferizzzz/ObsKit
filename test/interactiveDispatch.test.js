const { test } = require("node:test");
const assert = require("node:assert/strict");

const PROMPTS_PATH = require.resolve("@inquirer/prompts");
const originalPrompts = require(PROMPTS_PATH);

const CANCEL = Symbol("cancel");

// Every command module `commands/interactive.js` can dispatch to. Only the ones
// a test overrides are stubbed; the rest load normally (and are never called).
const COMMAND_PATHS = {
    "../commands/new": "new",
    "../commands/today": "today",
    "../commands/find": "find",
    "../commands/rename": "rename",
    "../commands/move": "move",
    "../commands/open": "open",
    "../commands/info": "info",
    "../commands/list": "list",
    "../commands/tree": "tree",
    "../commands/recent": "recent",
    "../commands/random": "random",
    "../commands/stats": "stats",
    "../commands/dashboard": "dashboard",
    "../commands/report": "report",
    "../commands/deadlinks": "deadlinks",
    "../commands/backlinks": "backlinks",
    "../commands/orphan": "orphan",
    "../commands/graph": "graph",
    "../commands/tags": "tags",
    "../commands/todo": "todo",
    "../commands/attachments": "attachments",
    "../commands/backup": "backup",
    "../commands/archive": "archive",
    "../commands/cleanup": "cleanup",
    "../commands/config": "config",
    "../commands/people": "people",
    "../commands/relate": "relate",
    "../commands/unrelate": "unrelate",
    "../commands/relations": "relations",
    "../commands/doctor": "doctor",
    "../commands/related": "related",
    "../commands/suggest": "suggest",
    "../commands/review": "review",
    "../commands/ai": "ai",
    "../commands/template": "template",
};

function exitPromptError() {
    const err = new Error("User force closed the prompt with 0 null");
    err.name = "ExitPromptError";
    return err;
}

// Loads commands/interactive.js with stubbed prompts and (optionally) stubbed
// commands so the real command logic never runs.
function loadInteractive({ prompts = {}, commands = {} } = {}) {
    require.cache[PROMPTS_PATH].exports = { ...originalPrompts, ...prompts };

    const reloadPaths = ["../commands/interactive", ...Object.keys(COMMAND_PATHS)];

    for (const rel of reloadPaths) {
        delete require.cache[require.resolve(rel)];
    }

    for (const [rel, stub] of Object.entries(commands)) {
        require(rel);
        require.cache[require.resolve(rel)].exports = stub;
    }

    const interactive = require("../commands/interactive");

    return {
        interactive,
        restore() {
            require.cache[PROMPTS_PATH].exports = originalPrompts;
            for (const rel of reloadPaths) {
                delete require.cache[require.resolve(rel)];
            }
        },
    };
}

// A scripted prompt set. Each kind pulls from its own queue; CANCEL throws an
// ExitPromptError like a real Ctrl+C.
function scripted({ select = [], input = [], confirm = [] } = {}) {
    const queues = {
        select: [...select],
        input: [...input],
        confirm: [...confirm],
    };

    const next = (kind) => {
        if (queues[kind].length === 0) {
            throw new Error(`no ${kind} answer queued`);
        }
        const value = queues[kind].shift();
        if (value === CANCEL) throw exitPromptError();
        return value;
    };

    return {
        select: async () => next("select"),
        input: async () => next("input"),
        confirm: async () => next("confirm"),
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

test("dispatch: every submenu opens and returns to the main menu", async () => {
    const select = [
        "notes", "back",
        "browse", "back",
        "knowledge", "back",
        "intel", "back",
        "relations", "back",
        "ai", "back",
        "people", "back",
        "template", "back",
        "utilities", "back",
        "config", "back",
        "exit",
    ];

    const { interactive, restore } = loadInteractive({ prompts: scripted({ select }) });
    try {
        await assert.doesNotReject(() => captureAsync(() => interactive()));
    } finally {
        restore();
    }
});

test("dispatch: rename forwards folder, current name and new name", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: scripted({
            select: ["notes", "rename", "back", "exit"],
            input: ["Projects", "Old Note", "New Note"],
        }),
        commands: { "../commands/rename": (...args) => calls.push(args) },
    });

    try {
        await captureAsync(() => interactive());
        assert.deepEqual(calls, [["Projects", "Old Note", "New Note"]]);
    } finally {
        restore();
    }
});

test("dispatch: move forwards source folder, title and target folder", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: scripted({
            select: ["notes", "move", "back", "exit"],
            input: ["Inbox", "Note A", "Archive"],
        }),
        commands: { "../commands/move": (...args) => calls.push(args) },
    });

    try {
        await captureAsync(() => interactive());
        assert.deepEqual(calls, [["Inbox", "Note A", "Archive"]]);
    } finally {
        restore();
    }
});

test("dispatch: backlinks and info forward the note name", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: scripted({
            select: ["knowledge", "backlinks", "back", "notes", "info", "back", "exit"],
            input: ["My Note", "Other Note"],
        }),
        commands: {
            "../commands/backlinks": (...args) => calls.push(["backlinks", ...args]),
            "../commands/info": (...args) => calls.push(["info", ...args]),
        },
    });

    try {
        await captureAsync(() => interactive());
        assert.deepEqual(calls, [
            ["backlinks", "My Note"],
            ["info", "Other Note"],
        ]);
    } finally {
        restore();
    }
});

test("dispatch: tags with blank input lists all tags", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: scripted({ select: ["knowledge", "tags", "back", "exit"], input: [""] }),
        commands: { "../commands/tags": (...args) => calls.push(args) },
    });

    try {
        await captureAsync(() => interactive());
        assert.deepEqual(calls, [[""]]);
    } finally {
        restore();
    }
});

test("dispatch: review defaults to the weekly period", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: scripted({ select: ["intel", "review", "back", "exit"], input: [""] }),
        commands: { "../commands/review": (...args) => calls.push(args) },
    });

    try {
        await captureAsync(() => interactive());
        assert.deepEqual(calls, [["week", {}]]);
    } finally {
        restore();
    }
});

test("dispatch: resetting config requires confirmation", async () => {
    const calls = [];
    const { interactive, restore } = loadInteractive({
        prompts: scripted({
            select: ["config", "reset", "back", "exit"],
            confirm: [false],
        }),
        commands: { "../commands/config": (...args) => calls.push(args) },
    });

    try {
        await captureAsync(() => interactive());
        assert.equal(calls.length, 0);
    } finally {
        restore();
    }
});

test("dispatch: a failing command reports and returns to the menu", async () => {
    const { interactive, restore } = loadInteractive({
        prompts: scripted({ select: ["browse", "stats", "back", "exit"] }),
        commands: {
            "../commands/stats": () => {
                throw new Error("Vault is not configured");
            },
        },
    });

    try {
        const output = await captureAsync(() => interactive());
        assert.ok(output.includes("Vault is not configured"));
    } finally {
        restore();
    }
});

test("dispatch: cancelling a prompt returns one level instead of exiting", async () => {
    const { interactive, restore } = loadInteractive({
        prompts: scripted({ select: ["notes", CANCEL, "exit"] }),
    });

    try {
        await assert.doesNotReject(() => captureAsync(() => interactive()));
    } finally {
        restore();
    }
});

test("dispatch: cancelling the main menu exits cleanly", async () => {
    const { interactive, restore } = loadInteractive({
        prompts: scripted({ select: [CANCEL] }),
    });

    try {
        await assert.doesNotReject(() => captureAsync(() => interactive()));
    } finally {
        restore();
    }
});
