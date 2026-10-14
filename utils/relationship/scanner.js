const fs = require("fs");
const path = require("path");

const { parseWikiLinks, getSectionContent } = require("./parser");
const { normalizeNoteRef, isSelfReference } = require("./validator");

function findNoteFile(files, name) {
    const clean = normalizeNoteRef(name);
    for (const file of files) {
        if (normalizeNoteRef(path.basename(file, ".md")) === clean) {
            return file;
        }
    }
    return null;
}

function scanOutgoingLinks(files) {
    const outgoing = {};

    for (const file of files) {
        const note = path.basename(file, ".md");
        const content = fs.readFileSync(file, "utf8");
        outgoing[note] = parseWikiLinks(content);
    }

    return outgoing;
}

// A backlink is a logical relationship, not a count of typed references:
// repeated "[[Note B]]" entries collapse to one, and a note never backlinks
// to itself. Keyed by normalized target, then by source, so the shape stays
// sorted and stable regardless of how many times a link appears.
function scanIncomingLinks(files) {
    const byTarget = new Map();

    for (const file of files) {
        const source = path.basename(file, ".md");
        const content = fs.readFileSync(file, "utf8");

        for (const link of parseWikiLinks(content)) {
            if (isSelfReference(source, link.target)) {
                continue;
            }

            const key = normalizeNoteRef(link.target);
            if (!byTarget.has(key)) {
                byTarget.set(key, new Map());
            }

            const sources = byTarget.get(key);
            if (sources.has(source)) {
                continue;
            }

            sources.set(source, {
                source,
                alias: link.alias,
                heading: link.heading,
            });
        }
    }

    const incoming = {};
    for (const [key, sources] of byTarget) {
        incoming[key] = [...sources.values()];
    }

    return incoming;
}

function scanRelatedLinks(files, noteName) {
    const file = findNoteFile(files, noteName);
    if (!file) return [];

    const content = fs.readFileSync(file, "utf8");
    const section = getSectionContent(content, "Related");

    return parseWikiLinks(section);
}

function collectRelationships(files) {
    return {
        outgoing: scanOutgoingLinks(files),
        incoming: scanIncomingLinks(files),
    };
}

module.exports = {
    findNoteFile,
    scanOutgoingLinks,
    scanIncomingLinks,
    scanRelatedLinks,
    collectRelationships,
};
