const fs = require("fs");
const path = require("path");

const { scanMarkdownFiles } = require("./scanner");
const { parseWikiLinks } = require("./relationship/parser");
const { normalizeNoteRef } = require("./relationship/validator");
const { extractTags } = require("./tags");

function uniqueSorted(values) {
    const seen = new Set();
    const out = [];

    for (const value of values) {
        const key = String(value);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }

    return out.sort((a, b) => a.localeCompare(b));
}

function extractTagKeys(content) {
    const seen = new Set();
    const keys = [];

    for (const tag of extractTags(content)) {
        const key = tag.slice(1).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
    }

    return keys.sort((a, b) => a.localeCompare(b));
}

function buildVaultIndex(vault) {
    const files = scanMarkdownFiles(vault).sort((a, b) => a.localeCompare(b));
    const notes = [];
    const byName = new Map();

    for (const file of files) {
        let content;
        let stat;

        try {
            content = fs.readFileSync(file, "utf8");
            stat = fs.statSync(file);
        } catch (err) {
            continue;
        }

        const name = path.basename(file, ".md");
        const relPath = path.relative(vault, file).split(path.sep).join("/");
        const outgoingDetails = parseWikiLinks(content);
        const outgoing = uniqueSorted(
            outgoingDetails.map((link) => normalizeNoteRef(link.target))
        );
        const tags = extractTagKeys(content);

        const creationTime =
            stat.birthtime && stat.birthtime.getTime() > 0
                ? stat.birthtime
                : stat.ctime;

        notes.push({
            file,
            name,
            relPath,
            content,
            size: stat.size,
            mtime: stat.mtime,
            created: creationTime,
            outgoing,
            outgoingDetails,
            tags,
            backlinks: [],
        });
    }

    for (const note of notes) {
        byName.set(note.name.toLowerCase(), note);
    }

    const backlinksMap = new Map();
    const referenced = new Set();

    for (const note of notes) {
        for (const target of note.outgoing) {
            referenced.add(target);
            if (!backlinksMap.has(target)) {
                backlinksMap.set(target, []);
            }
            backlinksMap.get(target).push(note.name);
        }
    }

    for (const note of notes) {
        const incoming = (backlinksMap.get(note.name.toLowerCase()) || [])
            .filter((name) => name.toLowerCase() !== note.name.toLowerCase())
            .sort((a, b) => a.localeCompare(b));
        note.backlinks = incoming;
    }

    return {
        vault,
        files,
        notes,
        byName,
        referenced,
    };
}

module.exports = {
    buildVaultIndex,
};