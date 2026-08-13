const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    getCommandNames,
    listNotes,
    getCandidates,
    completeWords,
    renderScript,
    SUPPORTED_SHELLS,
} = require("../commands/completion");

function fakeProgram() {
    return {
        commands: [
            { name: () => "init" },
            { name: () => "today" },
            { name: () => "ai" },
            { name: () => "find" },
            { name: () => "completion" },
            { name: () => "__complete" },
            { name: () => "help" },
        ],
    };
}

function makeVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-comp-"));
    fs.mkdirSync(path.join(root, "Notes"), { recursive: true });
    fs.mkdirSync(path.join(root, ".obsidian"), { recursive: true });
    fs.writeFileSync(path.join(root, "Learning Rust.md"), "# Rust\n");
    fs.writeFileSync(path.join(root, "Notes", "Cargo.md"), "# Cargo\n");
    fs.writeFileSync(path.join(root, ".obsidian", "hidden.md"), "hidden\n");
    fs.writeFileSync(path.join(root, "Notes", "data.txt"), "txt\n");
    return root;
}

test("getCommandNames: lists commands and hides __complete", () => {
    const names = getCommandNames(fakeProgram());
    assert.ok(names.includes("find"));
    assert.ok(names.includes("completion"));
    assert.ok(!names.includes("__complete"));
    assert.ok(names.includes("help"));
});

test("listNotes: returns relative markdown paths without extension", () => {
    const root = makeVault();
    const notes = listNotes(root);
    assert.ok(notes.includes("Learning Rust"));
    assert.ok(notes.includes("Notes/Cargo"));
    assert.ok(!notes.includes("hidden"));
    assert.ok(!notes.some((n) => n.includes(".obsidian")));
    assert.ok(!notes.includes("Notes/data"));
});

test("getCandidates: empty line lists all commands", () => {
    const names = getCandidates(fakeProgram(), "");
    assert.ok(names.includes("find"));
    assert.ok(names.includes("today"));
});

test("getCandidates: first word filters commands by prefix", () => {
    const names = getCandidates(fakeProgram(), "fi");
    assert.deepEqual(names, ["find"]);
});

test("getCandidates: first word starting with dash offers flags", () => {
    const names = getCandidates(fakeProgram(), "-");
    assert.ok(names.includes("--help"));
    assert.ok(names.includes("--version"));
});

test("getCandidates: ai subcommands", () => {
    const names = getCandidates(fakeProgram(), "ai t");
    assert.deepEqual(names, ["tomorrow"]);
});

test("getCandidates: later words offer note names", () => {
    const root = makeVault();
    const names = getCandidates(fakeProgram(), "open Lear", { root });
    assert.deepEqual(names, ["Learning Rust"]);
});

test("getCandidates: trailing space completes a fresh note argument", () => {
    const root = makeVault();
    const names = getCandidates(fakeProgram(), "open ", { root });
    assert.ok(names.includes("Learning Rust"));
    assert.ok(names.includes("Notes/Cargo"));
});

test("getCandidates: trailing space lists all ai subcommands", () => {
    const names = getCandidates(fakeProgram(), "ai ");
    assert.ok(names.includes("tomorrow"));
    assert.ok(names.includes("people"));
});

test("getCandidates: note completion is case-insensitive", () => {
    const root = makeVault();
    const names = getCandidates(fakeProgram(), "relate cargo", { root });
    assert.ok(names.includes("Notes/Cargo"));
});

test("completeWords: delegates to getCandidates", () => {
    const root = makeVault();
    assert.deepEqual(completeWords("fi", fakeProgram()), ["find"]);
    assert.deepEqual(completeWords("open car", fakeProgram(), { root }), [
        "Notes/Cargo",
    ]);
});

test("renderScript: returns a script for each supported shell", () => {
    SUPPORTED_SHELLS.forEach((shell) => {
        const script = renderScript(shell);
        assert.ok(typeof script === "string" && script.length > 0);
    });
});

test("renderScript: rejects unknown shells", () => {
    assert.equal(renderScript("tcsh"), null);
    assert.equal(renderScript(""), null);
});

test("renderScript: powershell registers for the CLI names", () => {
    const script = renderScript("powershell");
    assert.ok(script.includes("Register-ArgumentCompleter"));
    assert.ok(script.includes("obsidian-helper"));
});

test("renderScript: bash uses compgen and the __complete helper", () => {
    const script = renderScript("bash");
    assert.ok(script.includes("compgen"));
    assert.ok(script.includes("__complete"));
});
