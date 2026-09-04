const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const bin = path.join(__dirname, "..", "bin", "obs.js");
const pkg = require("../package.json");

function run(args) {
    return spawnSync(process.execPath, [bin, ...args], {
        encoding: "utf8",
        cwd: path.join(__dirname, ".."),
    });
}

test("interactive: module exports a function", () => {
    const interactive = require("../commands/interactive");
    assert.equal(typeof interactive, "function");
});

test("interactive: obs launches interactive mode (no crash)", () => {
    const { status } = run([]);
    assert.equal(status, 0);
});

test("interactive: --help still works", () => {
    const { status, stdout } = run(["--help"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("Usage"));
    assert.ok(stdout.includes("Contoh cepat"));
});

test("interactive: --version still works", () => {
    const { status, stdout } = run(["--version"]);
    assert.equal(status, 0);
    assert.equal(stdout.trim(), pkg.version);
});

test("interactive: unknown command still exits non-zero", () => {
    const { status, stderr } = run(["zzzz"]);
    assert.notEqual(status, 0);
    assert.ok((stderr || "").includes("zzzz"));
});

test("interactive: existing commands still work (template --list runs)", () => {
    const { status, stdout } = run(["template", "--list"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("Available Templates"));
});

test("interactive: missing required arg still fails", () => {
    const { status, stderr, stdout } = run(["find"]);
    assert.notEqual(status, 0);
    assert.ok((stderr + stdout).includes("required argument"));
});

test("interactive: completion still works", () => {
    const { status, stdout } = run(["completion", "bash"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("compgen"));
});

test("interactive: --help does not trigger interactive mode", () => {
    const { status, stdout } = run(["--help"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("Usage"));
    assert.ok(!stdout.includes("Pilih aksi"));
});

test("interactive: --version does not trigger interactive mode", () => {
    const { status, stdout } = run(["--version"]);
    assert.equal(status, 0);
    assert.equal(stdout.trim(), pkg.version);
    assert.ok(!stdout.includes("Pilih aksi"));
});

test("interactive: hidden __complete is not in help", () => {
    const { status, stdout } = run(["--help"]);
    assert.equal(status, 0);
    assert.ok(!stdout.includes("__complete"));
});

test("interactive: no vault scan on startup (obs exits cleanly without vault)", () => {
    const { status, stderr } = run([]);
    assert.equal(status, 0);
    const combined = (stderr || "") + (status === 0 ? "" : "");
    assert.ok(!combined.includes("Vault is not configured"));
});
