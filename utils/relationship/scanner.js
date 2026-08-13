const fs = require("fs");
const path = require("path");

const { parseWikiLinks, getSectionContent } = require("./parser");
const { normalizeNoteRef } = require("./validator");

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

function scanIncomingLinks(files) {
    const incoming = {};

    for (const file of files) {
        const source = path.basename(file, ".md");
        const content = fs.readFileSync(file, "utf8");

        for (const link of parseWikiLinks(content)) {
            const key = normalizeNoteRef(link.target);
            if (!incoming[key]) {
                incoming[key] = [];
            }
            incoming[key].push({
                source,
                alias: link.alias,
                heading: link.heading,
            });
        }
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
