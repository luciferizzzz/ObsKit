const { test } = require("node:test");
const assert = require("node:assert/strict");

const interactive = require("../commands/interactive");

const menus = interactive._menus;
const values = (name) => menus[name].map((choice) => choice.value);

// Top-level groups in the main menu. Every group (except "exit") must map to a
// submenu so no menu entry is a dead end.
const GROUP_TO_MENU = {
    notes: "notes",
    browse: "browse",
    knowledge: "knowledge",
    intel: "intelligence",
    relations: "relations",
    ai: "ai",
    people: "people",
    template: "template",
    utilities: "utilities",
    config: "config",
};

// Every user-facing command and where it lives in Interactive Mode.
const EXPECTED = {
    notes: ["new", "today", "find", "rename", "move", "open", "info"],
    browse: ["list", "tree", "recent", "random", "randomOpen", "stats", "dashboard", "report"],
    knowledge: ["deadlinks", "backlinks", "orphan", "graph", "tags"],
    utilities: ["todo", "attachments", "backup", "archive", "cleanup"],
    config: ["show", "set", "ai", "reset"],
    people: ["list", "recent", "stats"],
    relations: ["view", "add", "remove"],
    ai: ["write", "tomorrow", "update", "weekly", "people"],
    template: ["list", "preview", "create"],
    intelligence: ["doctor", "related", "suggest", "review"],
};

test("interactiveMenu: module exports a function with menu data", () => {
    assert.equal(typeof interactive, "function");
    assert.ok(menus && typeof menus === "object");
});

test("interactiveMenu: main menu exposes every top-level group", () => {
    assert.deepEqual(values("main"), [
        "notes",
        "browse",
        "knowledge",
        "intel",
        "relations",
        "ai",
        "people",
        "template",
        "utilities",
        "config",
        "exit",
    ]);
});

test("interactiveMenu: every group links to an existing submenu", () => {
    for (const group of values("main")) {
        if (group === "exit") continue;
        const menuName = GROUP_TO_MENU[group];
        assert.ok(menuName, `no menu mapping for group "${group}"`);
        assert.ok(menus[menuName], `missing submenu "${menuName}"`);
    }
});

test("interactiveMenu: every submenu offers a way back", () => {
    for (const name of Object.keys(menus)) {
        if (name === "main") {
            assert.ok(values(name).includes("exit"), "main menu must allow exit");
            continue;
        }
        assert.ok(values(name).includes("back"), `submenu "${name}" must allow back`);
    }
});

test("interactiveMenu: every command is reachable from the right submenu", () => {
    for (const [name, expected] of Object.entries(EXPECTED)) {
        const present = values(name);
        for (const command of expected) {
            assert.ok(
                present.includes(command),
                `"${command}" missing from "${name}" menu`
            );
        }
    }
});

test("interactiveMenu: no duplicate choices inside a menu", () => {
    for (const [name, choices] of Object.entries(menus)) {
        const seen = new Set();
        for (const { value } of choices) {
            assert.ok(!seen.has(value), `duplicate value "${value}" in "${name}"`);
            seen.add(value);
        }
    }
});

test("interactiveMenu: every choice has a label and a value", () => {
    for (const [name, choices] of Object.entries(menus)) {
        assert.ok(choices.length > 0, `menu "${name}" is empty`);
        for (const choice of choices) {
            assert.equal(typeof choice.name, "string", `bad label in "${name}"`);
            assert.ok(choice.name.trim().length > 0, `blank label in "${name}"`);
            assert.equal(typeof choice.value, "string", `bad value in "${name}"`);
            assert.ok(choice.value.trim().length > 0, `blank value in "${name}"`);
        }
    }
});
