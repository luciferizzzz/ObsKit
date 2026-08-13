const path = require("path");

function buildNoteIndex(files) {
    const notes = new Set();

    for (const file of files) {
        notes.add(path.basename(file, ".md"));
    }

    return notes;
}

function buildNormalizedNoteIndex(files) {
    const notes = new Set();

    for (const file of files) {
        notes.add(path.basename(file, ".md").toLowerCase());
    }

    return notes;
}

function buildFilePathMap(files) {
    const map = new Map();

    for (const file of files) {
        map.set(path.basename(file, ".md"), file);
    }

    return map;
}

module.exports = {
    buildNoteIndex,
    buildNormalizedNoteIndex,
    buildFilePathMap,
};