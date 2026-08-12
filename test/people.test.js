const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    INTERACTIONS_HEADING,
    MEETINGS_HEADING,
    findPeopleNote,
    readPeopleNote,
    parseInteractionOutput,
    extractInteractionBullets,
    appendInteraction,
    buildInteractionPrompt,
} = require("../utils/people");

const PEOPLE_NOTE = `# John Doe

**Role:** Developer

---

## Profil

Bekerja di frontend.

## Kontak

- **Email:** john@example.com

## Pertemuan

-

## Catatan Interaksi

- Discussed the website project.

---
`;

function makeVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-people-"));
    fs.mkdirSync(path.join(root, "People"), { recursive: true });
    fs.writeFileSync(path.join(root, "People", "John Doe.md"), PEOPLE_NOTE);
    fs.writeFileSync(path.join(root, "Home.md"), "# Home\n");
    return root;
}

function listFiles(root) {
    return fs.readdirSync(root, { recursive: true })
        .filter((entry) => typeof entry === "string" && entry.endsWith(".md"))
        .map((entry) => path.join(root, entry));
}

test("INTERACTIONS_HEADING matches the People template section", () => {
    assert.equal(INTERACTIONS_HEADING, "Catatan Interaksi");
    assert.equal(MEETINGS_HEADING, "Pertemuan");
});

test("findPeopleNote: locates an existing People note", () => {
    const root = makeVault();
    const file = findPeopleNote(listFiles(root), "John Doe");
    assert.equal(path.basename(file), "John Doe.md");
});

test("findPeopleNote: matches case-insensitively", () => {
    const root = makeVault();
    const file = findPeopleNote(listFiles(root), "john doe");
    assert.equal(path.basename(file), "John Doe.md");
});

test("findPeopleNote: missing note returns null", () => {
    const root = makeVault();
    assert.equal(findPeopleNote(listFiles(root), "Jane Smith"), null);
});

test("readPeopleNote: reads the note content", () => {
    const root = makeVault();
    const file = findPeopleNote(listFiles(root), "John Doe");
    const content = readPeopleNote(file);
    assert.ok(content.includes("## Catatan Interaksi"));
});

test("parseInteractionOutput: converts plain lines to bullets", () => {
    const bullets = parseInteractionOutput("Helped with the frontend\nShared the design\n");
    assert.deepEqual(bullets, [
        "- Helped with the frontend",
        "- Shared the design",
    ]);
});

test("parseInteractionOutput: keeps existing bullets and strips headings", () => {
    const bullets = parseInteractionOutput("## Catatan Interaksi\n- First\n* Second\n");
    assert.deepEqual(bullets, ["- First", "- Second"]);
});

test("parseInteractionOutput: ignores code fences and placeholder bullets", () => {
    const bullets = parseInteractionOutput("```\n- not a bullet\n```\n- real bullet\n- \n");
    assert.deepEqual(bullets, ["- real bullet"]);
});

test("parseInteractionOutput: ignores horizontal rules", () => {
    const bullets = parseInteractionOutput("- bullet\n---\n");
    assert.deepEqual(bullets, ["- bullet"]);
});

test("parseInteractionOutput: empty output returns no bullets", () => {
    assert.deepEqual(parseInteractionOutput(""), []);
    assert.deepEqual(parseInteractionOutput("## Heading only\n"), []);
});

test("extractInteractionBullets: reads bullets from the section only", () => {
    const bullets = extractInteractionBullets(PEOPLE_NOTE);
    assert.deepEqual(bullets, ["- Discussed the website project."]);
});

test("appendInteraction: appends to an existing section", () => {
    const { content, changed, added } = appendInteraction(PEOPLE_NOTE, [
        "- John agreed to help with the frontend.",
    ]);
    assert.equal(changed, true);
    assert.deepEqual(added, ["- John agreed to help with the frontend."]);
    assert.ok(content.includes("- Discussed the website project."));
    assert.ok(content.includes("- John agreed to help with the frontend."));
    assert.ok(
        content.indexOf("- John agreed to help with the frontend.") >
        content.indexOf("- Discussed the website project.")
    );
});

test("appendInteraction: preserves unrelated sections", () => {
    const { content } = appendInteraction(PEOPLE_NOTE, ["- New interaction."]);
    assert.ok(content.includes("## Profil"));
    assert.ok(content.includes("Bekerja di frontend."));
    assert.ok(content.includes("## Kontak"));
    assert.ok(content.includes("## Pertemuan"));
    assert.ok(content.includes("john@example.com"));
});

test("appendInteraction: prevents duplicate interaction bullets", () => {
    const { content, changed, added, skipped } = appendInteraction(PEOPLE_NOTE, [
        "- DISCUSSED THE WEBSITE PROJECT.",
    ]);
    assert.equal(changed, false);
    assert.deepEqual(added, []);
    assert.equal(skipped, 1);
    assert.equal(content, PEOPLE_NOTE);
});

test("appendInteraction: skips partial duplicates", () => {
    const { content, changed, added, skipped } = appendInteraction(PEOPLE_NOTE, [
        "- Discussed the website project.",
        "- New item.",
    ]);
    assert.equal(changed, true);
    assert.deepEqual(added, ["- New item."]);
    assert.equal(skipped, 1);
    assert.equal((content.match(/- Discussed the website project\./g) || []).length, 1);
    assert.ok(content.includes("- New item."));
});

test("appendInteraction: replaces placeholder bullet and keeps closing rule", () => {
    const templateNote = `# John Doe

## Catatan Interaksi

-

---
`;
    const { content, changed } = appendInteraction(templateNote, ["- Met John today."]);
    assert.equal(changed, true);
    assert.ok(content.includes("- Met John today."));
    assert.ok(!content.includes("\n- \n"));
    assert.ok(content.trimEnd().endsWith("---"));
});

test("appendInteraction: creates the section when missing", () => {
    const before = "# John Doe\n\n## Profil\n\nFrontend engineer.\n";
    const { content, changed } = appendInteraction(before, ["- Met John."]);
    assert.equal(changed, true);
    assert.ok(content.includes("## Catatan Interaksi"));
    assert.ok(content.includes("- Met John."));
    assert.ok(content.includes("## Profil"));
});

test("appendInteraction: repeated append is idempotent", () => {
    const first = appendInteraction(PEOPLE_NOTE, ["- New interaction."]).content;
    const second = appendInteraction(first, ["- New interaction."]);
    assert.equal(second.changed, false);
    assert.equal(second.content, first);
    assert.equal((first.match(/- New interaction\./g) || []).length, 1);
});

test("appendInteraction: preserves CRLF line endings", () => {
    const crlf = PEOPLE_NOTE.replace(/\n/g, "\r\n");
    const { content } = appendInteraction(crlf, ["- New interaction."]);
    assert.ok(content.includes("\r\n"));
    assert.ok(!content.replace(/\r\n/g, "").includes("\r"));
    assert.ok(content.includes("- New interaction."));
});

test("buildInteractionPrompt: includes context, interaction, and persona system", () => {
    const persona = { id: "default", name: "Default", system: "SYS" };
    const prompt = buildInteractionPrompt({
        name: "John Doe",
        content: "# John Doe\n\n## Catatan Interaksi\n\n- old\n",
        interaction: "talked about the website",
        persona,
    });
    assert.ok(prompt.includes("SYS"));
    assert.ok(prompt.includes("John Doe"));
    assert.ok(prompt.includes("talked about the website"));
    assert.ok(prompt.includes("Catatan Interaksi"));
});
