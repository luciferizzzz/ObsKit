const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    getPeopleDirectory,
    listPeople,
    recentPeople,
    peopleStats,
} = require("../utils/people");

const {
    peopleList,
    peopleRecentCommand,
    peopleStatsCommand,
} = require("../commands/people");

function makeVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-people-mgmt-"));
    fs.mkdirSync(path.join(root, "People"), { recursive: true });
    return root;
}

function writePeople(root, names) {
    names.forEach((name) => {
        fs.writeFileSync(path.join(root, "People", `${name}.md`), `# ${name}\n`);
    });
}

function setMtime(root, name, date) {
    const file = path.join(root, "People", `${name}.md`);
    fs.utimesSync(file, date, date);
}

function withVault(root, fn) {
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    try {
        return fn();
    } finally {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    }
}

function capture(fn) {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.map(String).join(" "));
    try {
        fn();
    } finally {
        console.log = original;
    }
    return logs.join("\n");
}

test("getPeopleDirectory: resolves to the People folder inside the vault", () => {
    const root = makeVault();
    assert.equal(getPeopleDirectory(root), path.join(root, "People"));
});

test("listPeople: returns note names sorted alphabetically", () => {
    const root = makeVault();
    writePeople(root, ["Bob", "Sarah", "Alice", "Charlie"]);
    assert.deepEqual(listPeople(root), ["Alice", "Bob", "Charlie", "Sarah"]);
});

test("listPeople: ignores non-markdown files", () => {
    const root = makeVault();
    writePeople(root, ["Alice", "Bob"]);
    fs.writeFileSync(path.join(root, "People", "README.txt"), "note\n");
    fs.writeFileSync(path.join(root, "People", "notes.md~"), "temp\n");
    assert.deepEqual(listPeople(root), ["Alice", "Bob"]);
});

test("listPeople: empty People directory returns an empty array", () => {
    const root = makeVault();
    assert.deepEqual(listPeople(root), []);
});

test("listPeople: missing People directory returns an empty array", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-people-mgmt-"));
    assert.deepEqual(listPeople(root), []);
});

test("recentPeople: sorts by modification time, newest first", () => {
    const root = makeVault();
    writePeople(root, ["Alice", "Bob", "Charlie"]);
    setMtime(root, "Alice", new Date("2026-08-01T10:00:00Z"));
    setMtime(root, "Bob", new Date("2026-08-02T10:00:00Z"));
    setMtime(root, "Charlie", new Date("2026-08-03T10:00:00Z"));
    assert.deepEqual(recentPeople(root), ["Charlie", "Bob", "Alice"]);
});

test("recentPeople: respects the limit", () => {
    const root = makeVault();
    const names = Array.from({ length: 12 }, (_, i) => `Person${String(i + 1).padStart(2, "0")}`);
    writePeople(root, names);
    names.forEach((name, index) => {
        const date = new Date(2026, 7, 1 + index);
        setMtime(root, name, date);
    });
    const recent = recentPeople(root, 3);
    assert.equal(recent.length, 3);
    assert.deepEqual(recent, ["Person12", "Person11", "Person10"]);
});

test("recentPeople: empty People directory returns an empty array", () => {
    const root = makeVault();
    assert.deepEqual(recentPeople(root), []);
});

test("recentPeople: missing People directory returns an empty array", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-people-mgmt-"));
    assert.deepEqual(recentPeople(root), []);
});

test("peopleStats: counts the total number of People notes", () => {
    const root = makeVault();
    writePeople(root, ["Alice", "Bob", "Charlie", "Sarah"]);
    assert.deepEqual(peopleStats(root), { total: 4 });
});

test("peopleStats: empty People directory reports zero", () => {
    const root = makeVault();
    assert.deepEqual(peopleStats(root), { total: 0 });
});

test("peopleStats: missing People directory reports zero", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-people-mgmt-"));
    assert.deepEqual(peopleStats(root), { total: 0 });
});

test("peopleList: prints the heading and bulleted note names", () => {
    const root = makeVault();
    writePeople(root, ["Bob", "Sarah", "Alice", "Charlie"]);
    const output = withVault(root, () => capture(() => peopleList()));
    assert.ok(output.includes("People notes (4)"));
    assert.ok(output.includes("• Alice"));
    assert.ok(output.includes("• Bob"));
    assert.ok(output.includes("• Charlie"));
    assert.ok(output.includes("• Sarah"));
    assert.ok(output.indexOf("• Alice") < output.indexOf("• Bob"));
});

test("peopleList: empty People directory shows an informational message", () => {
    const root = makeVault();
    const output = withVault(root, () => capture(() => peopleList()));
    assert.ok(output.includes("Tidak ada People note."));
});

test("peopleList: missing People directory shows an informational message", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-people-mgmt-"));
    const output = withVault(root, () => capture(() => peopleList()));
    assert.ok(output.includes("Tidak ada People note."));
});

test("peopleRecentCommand: prints notes ordered by last modification", () => {
    const root = makeVault();
    writePeople(root, ["Alice", "Bob", "Charlie"]);
    setMtime(root, "Alice", new Date("2026-08-01T10:00:00Z"));
    setMtime(root, "Bob", new Date("2026-08-02T10:00:00Z"));
    setMtime(root, "Charlie", new Date("2026-08-03T10:00:00Z"));
    const output = withVault(root, () => capture(() => peopleRecentCommand()));
    assert.ok(output.includes("Recently updated"));
    assert.ok(output.indexOf("• Charlie") < output.indexOf("• Bob"));
    assert.ok(output.indexOf("• Bob") < output.indexOf("• Alice"));
});

test("peopleRecentCommand: empty People directory shows an informational message", () => {
    const root = makeVault();
    const output = withVault(root, () => capture(() => peopleRecentCommand()));
    assert.ok(output.includes("Tidak ada People note."));
});

test("peopleStatsCommand: prints the total note count", () => {
    const root = makeVault();
    writePeople(root, ["Alice", "Bob", "Charlie", "Sarah"]);
    const output = withVault(root, () => capture(() => peopleStatsCommand()));
    assert.ok(output.includes("People statistics"));
    assert.ok(output.includes("Total notes: 4"));
});
