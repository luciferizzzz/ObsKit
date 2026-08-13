const fs = require("fs");

const { normalizeNoteRef } = require("./validator");

const RELATED_HEADING = "Related";

function detectNewline(content) {
    return content.includes("\r\n") ? "\r\n" : "\n";
}

function splitLines(content) {
    return content.split(/\r?\n/);
}

function isHeading(line) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) return null;
    return {
        level: match[1].length,
        text: match[2].trim(),
    };
}

function findSection(lines, heading) {
    const target = String(heading).trim().toLowerCase();
    let start = -1;
    let end = lines.length;

    for (let i = 0; i < lines.length; i++) {
        const headingMatch = isHeading(lines[i]);
        if (!headingMatch) continue;

        if (start >= 0) {
            end = i;
            break;
        }
        if (headingMatch.text.toLowerCase() === target) {
            start = i;
        }
    }

    return { start, end };
}

function isRelatedBullet(line) {
    const match = line.match(/^\s*[-*]\s*\[\[([^\]]+)\]\]\s*$/);
    if (!match) return null;
    return match[1];
}

function ensureSection(content, heading) {
    const newline = detectNewline(content);
    const lines = splitLines(content);
    const { start } = findSection(lines, heading);

    if (start >= 0) {
        return { content, added: false };
    }

    while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
    }

    const headingLine = `## ${String(heading).replace(/^#{1,6}\s+/, "").trim()}`;
    const block = lines.length === 0
        ? `${headingLine}${newline}`
        : `${newline}${newline}${headingLine}${newline}`;

    return {
        content: lines.join(newline) + block,
        added: true,
    };
}

function addRelated(content, related) {
    const newline = detectNewline(content);
    const lines = splitLines(content);
    const { start, end } = findSection(lines, RELATED_HEADING);

    // Check for duplicates in the Related section
    if (start >= 0) {
        for (let i = start + 1; i < end; i++) {
            const link = isRelatedBullet(lines[i]);
            if (link && normalizeNoteRef(link) === normalizeNoteRef(related)) {
                return { content, added: false };
            }
        }
    }

    const bullet = `- [[${related}]]`;

    // Section does not exist — append a new one at the end of the note
    if (start < 0) {
        const ensured = ensureSection(content, RELATED_HEADING);
        return {
            content: ensured.content + `${bullet}${newline}`,
            added: true,
        };
    }

    // Section exists — insert the bullet after the last non-empty line
    let insertion = start + 1;
    for (let i = start + 1; i < end; i++) {
        if (lines[i] !== "") {
            insertion = i + 1;
        }
    }
    lines.splice(insertion, 0, bullet);
    return {
        content: lines.join(newline),
        added: true,
    };
}

function removeRelated(content, related) {
    const newline = detectNewline(content);
    const lines = splitLines(content);
    const kept = [];
    let removed = false;
    let inRelated = false;

    for (const line of lines) {
        const headingMatch = isHeading(line);

        if (headingMatch) {
            inRelated = headingMatch.text.toLowerCase() === RELATED_HEADING.toLowerCase();
            kept.push(line);
            continue;
        }

        if (inRelated) {
            const link = isRelatedBullet(line);
            if (link && normalizeNoteRef(link) === normalizeNoteRef(related)) {
                removed = true;
                continue;
            }
        }

        kept.push(line);
    }

    return {
        content: kept.join(newline),
        removed,
    };
}

function updateMarkdown(filePath, content) {
    const original = fs.readFileSync(filePath, "utf8");
    const newline = detectNewline(original);
    let output = content;

    if (newline === "\r\n") {
        output = output.replace(/\r?\n/g, "\r\n");
    }

    fs.writeFileSync(filePath, output, "utf8");
}

function addRelatedToFile(filePath, related) {
    const content = fs.readFileSync(filePath, "utf8");
    const result = addRelated(content, related);

    if (result.added) {
        updateMarkdown(filePath, result.content);
    }

    return result;
}

function removeRelatedFromFile(filePath, related) {
    const content = fs.readFileSync(filePath, "utf8");
    const result = removeRelated(content, related);

    if (result.removed) {
        updateMarkdown(filePath, result.content);
    }

    return result;
}

module.exports = {
    RELATED_HEADING,
    detectNewline,
    ensureSection,
    addRelated,
    removeRelated,
    updateMarkdown,
    addRelatedToFile,
    removeRelatedFromFile,
};
