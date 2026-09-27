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

    // Backlinks are resolved by file identity (relPath), not by lowercased
    // basename. Matching on the basename makes two notes that differ only in
    // casing ("Sub1/Note.md" vs "Sub2/note.md") steal each other's backlinks,
    // and the previous name-based self-filter then hid a real cross-folder
    // link. Sets also collapse repeated "[[Note B]]" references and drop
    // self-references by construction.
    const backlinkSources = new Map();
    const referenced = new Set();

    for (const note of notes) {
        for (const target of note.outgoing) {
            referenced.add(target);

            const resolved = byName.get(target);
            if (!resolved || resolved.relPath === note.relPath) {
                continue;
            }

            if (!backlinkSources.has(resolved.relPath)) {
                backlinkSources.set(resolved.relPath, new Set());
            }
            backlinkSources.get(resolved.relPath).add(note.relPath);
        }
    }

    const nameByRelPath = new Map(notes.map((note) => [note.relPath, note.name]));

    for (const note of notes) {
        const sources = backlinkSources.get(note.relPath) || new Set();
        note.backlinks = [...sources]
            .map((relPath) => nameByRelPath.get(relPath))
            .filter((name) => typeof name === "string")
            .sort((a, b) => a.localeCompare(b));
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