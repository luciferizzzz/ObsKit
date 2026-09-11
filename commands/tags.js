const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { stripCodeBlocks, extractTags } = require("../utils/tags");
const c = require("../utils/colors");

function normalizeTagQuery(query) {
    return String(query || "")
        .trim()
        .replace(/^#+/, "")
        .trim()
        .toLowerCase();
}

function buildTagIndex(vault, files) {
    const displayNames = new Map();
    const byTag = new Map();

    for (const file of files) {
        let content;
        try {
            content = fs.readFileSync(file, "utf8");
        } catch {
            continue;
        }

        const found = extractTags(content);
        if (found.length === 0) continue;

        const relPath = path.relative(vault, file).split(path.sep).join("/");

        const uniqueKeys = new Set();
        for (const tag of found) {
            const key = tag.slice(1).toLowerCase();
            if (!displayNames.has(key)) {
                displayNames.set(key, tag);
            }
            uniqueKeys.add(key);
        }

        for (const key of uniqueKeys) {
            if (!byTag.has(key)) {
                byTag.set(key, []);
            }
            byTag.get(key).push({
                file,
                relativePath: relPath,
            });
        }
    }

    return { displayNames, byTag };
}

function findNotesByTag(vault, files, query) {
    const normalized = normalizeTagQuery(query);
    const { displayNames, byTag } = buildTagIndex(vault, files);

    return {
        query: normalized,
        tag: displayNames.get(normalized) || "#" + normalized,
        notes: byTag.get(normalized) || [],
    };
}

function showTagNotes(result) {
    console.log(`\n${c.heading("🏷️  Tag")}: ${c.tag(result.tag)}\n`);

    if (result.notes.length === 0) {
        console.log(c.dim("No notes found."));
        return;
    }

    const sorted = result.notes
        .slice()
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    console.log(`${c.heading("Notes:")}\n`);
    for (const note of sorted) {
        console.log(`  ${c.path(note.relativePath)}`);
    }

    console.log(`\n${c.divider("-----------------------")}`);
    console.log(`${c.title("Total Notes")} : ${c.value(sorted.length)}`);
}

function tags(tagQuery) {
    const vault = getVaultPath();

    const files = scanMarkdownFiles(vault);

    const normalizedQuery = normalizeTagQuery(tagQuery);
    if (normalizedQuery) {
        showTagNotes(findNotesByTag(vault, files, normalizedQuery));
        return;
    }

    const tagCount = {};

    for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        const found = extractTags(content);

        for (const tag of found) {
            if (!tagCount[tag]) {
                tagCount[tag] = 0;
            }
            tagCount[tag]++;
        }
    }

    const sorted = Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1]);

    const uniqueCount = sorted.length;
    const totalCount = sorted.reduce((sum, [, count]) => sum + count, 0);

    console.log(`\n${c.heading("🏷️  Tags")}\n`);

    for (const [tag, count] of sorted) {
        console.log(`${c.tag(tag)} ${c.dim(`(${count})`)}`);
    }

    console.log(`\n${c.divider("-----------------------")}`);
    console.log(`${c.title("Total Tags")} : ${c.value(totalCount)}`);
    console.log(`${c.title("Unique Tags")} : ${c.value(uniqueCount)}`);
}

module.exports = tags;

module.exports.extractTags = extractTags;
module.exports.stripCodeBlocks = stripCodeBlocks;
module.exports.normalizeTagQuery = normalizeTagQuery;
module.exports.buildTagIndex = buildTagIndex;
module.exports.findNotesByTag = findNotesByTag;
