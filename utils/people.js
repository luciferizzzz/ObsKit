const fs = require("fs");
const path = require("path");

const { getSectionContent } = require("./relationship/parser");
const { detectNewline } = require("./relationship/editor");
const { findNoteFile } = require("./relationship/scanner");

const INTERACTIONS_HEADING = "Catatan Interaksi";
const MEETINGS_HEADING = "Pertemuan";

const PLACEHOLDER_RE = /^\s*[-*]\s*$/;
const HR_RE = /^\s*[-*_]{3,}\s*$/;
const HEADING_RE = /^#{1,6}\s+/;

function findSection(lines, heading) {
    const target = String(heading).trim().toLowerCase();
    let start = -1;
    let end = lines.length;

    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
        if (!match) continue;

        if (start >= 0) {
            end = i;
            break;
        }
        if (match[2].trim().toLowerCase() === target) {
            start = i;
        }
    }

    return { start, end };
}

function findPeopleNote(files, name) {
    return findNoteFile(files, name);
}

function readPeopleNote(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function bulletText(line) {
    const match = String(line).trim().match(/^[-*]\s+(.+)$/);
    return match ? match[1].trim() : null;
}

function normalizeBulletText(text) {
    return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isBulletLine(line) {
    return /^\s*[-*]\s+\S/.test(line);
}

function parseInteractionOutput(output) {
    const lines = String(output || "")
        .replace(/\r\n/g, "\n")
        .split("\n");

    const bullets = [];
    let inFence = false;

    for (const raw of lines) {
        const line = raw.trim();

        if (line.startsWith("```")) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;
        if (!line) continue;
        if (HEADING_RE.test(line)) continue;
        if (PLACEHOLDER_RE.test(line)) continue;
        if (HR_RE.test(line)) continue;

        const text = bulletText(line);
        bullets.push(text ? `- ${text}` : `- ${line}`);
    }

    return bullets;
}

function extractInteractionBullets(content) {
    const section = getSectionContent(content, INTERACTIONS_HEADING);
    if (!section) return [];

    return section
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(isBulletLine)
        .map((line) => `- ${bulletText(line)}`);
}

function appendInteraction(content, bullets) {
    const newline = detectNewline(content);
    const lines = content.split(/\r?\n/);
    const { start, end } = findSection(lines, INTERACTIONS_HEADING);

    const existing =
        start >= 0 ? extractInteractionBullets(content) : [];
    const seen = new Set(
        existing.map((b) => normalizeBulletText(bulletText(b)))
    );

    const added = [];
    let skipped = 0;

    for (const bullet of bullets) {
        const key = normalizeBulletText(bulletText(bullet));
        if (key && !seen.has(key)) {
            seen.add(key);
            added.push(bullet);
        } else {
            skipped++;
        }
    }

    if (added.length === 0) {
        return { content, changed: false, added, skipped };
    }

    // Section missing — create it at the end of the note
    if (start < 0) {
        while (lines.length > 0 && lines[lines.length - 1] === "") {
            lines.pop();
        }
        lines.push("", `## ${INTERACTIONS_HEADING}`, "", ...added, "");
        return { content: lines.join(newline), changed: true, added, skipped };
    }

    // Section exists — find where to insert
    const bodyStart = start + 1;
    let lastContent = -1;
    let placeholderIndex = -1;

    for (let i = bodyStart; i < end; i++) {
        const line = lines[i].trim();
        if (line === "") continue;
        if (HR_RE.test(line)) continue;
        if (PLACEHOLDER_RE.test(line)) {
            if (placeholderIndex < 0) placeholderIndex = i;
            continue;
        }
        lastContent = i;
    }

    let insertAt;
    if (lastContent < 0) {
        insertAt = placeholderIndex >= 0 ? placeholderIndex : bodyStart;
        if (placeholderIndex < 0) {
            while (insertAt < end && lines[insertAt] === "") insertAt++;
        }
        if (placeholderIndex >= 0) {
            lines.splice(placeholderIndex, 1);
        }
    } else {
        insertAt = lastContent + 1;
        while (insertAt < end && lines[insertAt] === "") insertAt++;
    }

    lines.splice(insertAt, 0, ...added);

    return { content: lines.join(newline), changed: true, added, skipped };
}

function buildInteractionPrompt({ name, content, interaction, persona }) {
    const context = String(content || "").trim();
    const system = (persona && persona.system) || "";

    return `${system}

Konteks: note People "${name}" saat ini:

${context}

Interaksi terakhir yang harus dicatat:
${interaction}

Instruksi:
- Buat 2-4 bullet point ringkas untuk bagian "## Catatan Interaksi".
- Tulis dengan bahasa yang konsisten dengan isi note.
- Hanya output bullet point (diawali "- "), tanpa heading, tanpa pembukaan, tanpa penjelasan tambahan.
- Jangan mengulang interaksi yang sudah ada.`;
}

function getPeopleDirectory(vaultPath) {
    return path.join(vaultPath, "People");
}

function listPeople(vaultPath) {
    const dir = getPeopleDirectory(vaultPath);

    if (!fs.existsSync(dir)) {
        return [];
    }

    return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith(".md"))
        .map((file) => file.replace(/\.md$/i, ""))
        .sort((a, b) => a.localeCompare(b));
}

function recentPeople(vaultPath, limit = 10) {
    const dir = getPeopleDirectory(vaultPath);

    if (!fs.existsSync(dir)) {
        return [];
    }

    return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith(".md"))
        .map((file) => ({
            name: file.replace(/\.md$/i, ""),
            modified: fs.statSync(path.join(dir, file)).mtime,
        }))
        .sort((a, b) => b.modified - a.modified)
        .slice(0, limit)
        .map((item) => item.name);
}

function peopleStats(vaultPath) {
    const notes = listPeople(vaultPath);

    return {
        total: notes.length,
    };
}

module.exports = {
    INTERACTIONS_HEADING,
    MEETINGS_HEADING,
    findSection,
    findPeopleNote,
    readPeopleNote,
    bulletText,
    normalizeBulletText,
    parseInteractionOutput,
    extractInteractionBullets,
    appendInteraction,
    buildInteractionPrompt,
    getPeopleDirectory,
    listPeople,
    recentPeople,
    peopleStats,
};
