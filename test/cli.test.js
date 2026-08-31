const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const bin = path.join(__dirname, "..", "bin", "obs.js");

function run(args) {
    return spawnSync(process.execPath, [bin, ...args], {
        encoding: "utf8",
        cwd: path.join(__dirname, ".."),
    });
}

test("cli: --version prints the package version", () => {
    const { status, stdout } = run(["--version"]);
    assert.equal(status, 0);
    assert.equal(stdout.trim(), "1.5.5");
});

test("cli: --help shows usage and quick examples", () => {
    const { status, stdout } = run(["--help"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("Usage"));
    assert.ok(stdout.includes("Contoh cepat"));
});

test("cli: completion bash generates a completion script", () => {
    const { status, stdout } = run(["completion", "bash"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("compgen"));
    assert.ok(stdout.includes("__complete"));
});

test("cli: completion rejects an unknown shell", () => {
    const { status, stdout } = run(["completion", "tcsh"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("Shell tidak didukung"));
});

test("cli: __complete offers command candidates", () => {
    const { status, stdout } = run(["__complete", "fi"]);
    assert.equal(status, 0);
    assert.ok(stdout.split("\n").map((s) => s.trim()).includes("find"));
});

test("cli: unknown command exits non-zero with a suggestion", () => {
    const { status, stderr, stdout } = run(["conffig"]);
    assert.notEqual(status, 0);
    assert.ok((stderr + stdout).includes("config"));
});

test("cli: missing required argument exits non-zero", () => {
    const { status, stderr, stdout } = run(["find"]);
    assert.notEqual(status, 0);
    assert.ok((stderr + stdout).includes("required argument"));
});

test("cli: hidden __complete is not listed in help", () => {
    const { status, stdout } = run(["--help"]);
    assert.equal(status, 0);
    assert.ok(!stdout.includes("__complete"));
});
