const fs = require("fs");
const path = require("path");

const { getSectionContent } = require("./relationship/parser");
const { detectNewline } = require("./relationship/editor");

const DAILY_NOTES_DIR = "Daily Notes";
const TOMORROW_HEADING = "Tomorrow";
const UPDATE_HEADING = "Update";

function formatDate(d) {
    return (
        `${d.getFullYear()}-` +
        `${String(d.getMonth() + 1).padStart(2, "0")}-` +
        `${String(d.getDate()).padStart(2, "0")}`
    );
}

function parseDateString(dateString) {
    const [y, m, d] = String(dateString).split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function addDays(dateString, delta) {
    const d = parseDateString(dateString);
    d.setDate(d.getDate() + delta);
    return formatDate(d);
}

function getPreviousDate(dateString) {
    return addDays(dateString, -1);
}

function dailyNotePath(vault, date) {
    return path.join(vault, DAILY_NOTES_DIR, `${date}.md`);
}

function extractSectionLines(content, heading) {
    const section = getSectionContent(content, heading);
    return section ? section.split(/\r?\n/) : [];
}

function parseChecklistItem(line) {
    const match = line.match(/^(\s*[-*])\s+\[([ xX])\]\s+(.+)$/);
    if (!match) return null;
    return {
        marker: match[1],
        state: match[2],
        text: match[3].trim(),
        raw: line,
    };
}

function extractChecklistItems(sectionLines) {
    const items = [];
    for (const line of sectionLines) {
        const item = parseChecklistItem(line);
        if (item) items.push(item.raw);
    }
    return items;
}

function normalizeTaskText(text) {
    return String(text).trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeChecklistItems(existing, incoming) {
    const seen = new Set();
    const merged = [];

    for (const raw of [...existing, ...incoming]) {
        const item = parseChecklistItem(raw);
        if (!item) continue;
        const key = normalizeTaskText(item.text);
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(raw);
        }
    }

    return merged;
}

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

function upsertUpdateSection(content, items) {
    if (!items || items.length === 0) {
        return { content, changed: false };
    }

    const newline = detectNewline(content);
    const lines = content.split(/\r?\n/);
    const { start, end } = findSection(lines, UPDATE_HEADING);

    const existingItems =
        start >= 0 ? extractChecklistItems(lines.slice(start + 1, end)) : [];
    const merged = mergeChecklistItems(existingItems, items);
    const newItems = merged.slice(existingItems.length);

    if (newItems.length === 0) {
        return { content, changed: false };
    }

    if (start < 0) {
        while (lines.length > 0 && lines[lines.length - 1] === "") {
            lines.pop();
        }
        lines.push("", `## ${UPDATE_HEADING}`, "", ...merged, "");
        return { content: lines.join(newline), changed: true };
    }

    let lastChecklist = -1;
    for (let i = start + 1; i < end; i++) {
        if (parseChecklistItem(lines[i])) lastChecklist = i;
    }

    let insertAt;
    if (lastChecklist >= 0) {
        insertAt = lastChecklist + 1;
    } else {
        insertAt = start + 1;
        while (insertAt < end && lines[insertAt] === "") insertAt++;
        if (insertAt === start + 1) {
            lines.splice(start + 1, 0, "");
            insertAt = start + 2;
        }
    }

    lines.splice(insertAt, 0, ...newItems);
    return { content: lines.join(newline), changed: true };
}

function loadTomorrowTasks(vault, date) {
    const filePath = dailyNotePath(vault, getPreviousDate(date));
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf8");
    return extractChecklistItems(extractSectionLines(content, TOMORROW_HEADING));
}

function importTomorrowTasks(content, tasks) {
    return upsertUpdateSection(content, tasks).content;
}

module.exports = {
    DAILY_NOTES_DIR,
    TOMORROW_HEADING,
    UPDATE_HEADING,
    formatDate,
    addDays,
    getPreviousDate,
    dailyNotePath,
    extractSectionLines,
    parseChecklistItem,
    extractChecklistItems,
    normalizeTaskText,
    mergeChecklistItems,
    upsertUpdateSection,
    loadTomorrowTasks,
    importTomorrowTasks,
};
