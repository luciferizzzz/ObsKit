const { normalizeTarget } = require("./parser");

function normalizeNoteRef(ref) {
    return String(ref)
        .split("#")[0]
        .split("|")[0]
        .split("/")
        .pop()
        .replace(/\.md$/i, "")
        .trim()
        .toLowerCase();
}

function isDuplicate(links, target) {
    const clean = normalizeNoteRef(target);
    return links.some((link) => {
        const value = typeof link === "string" ? link : link.target;
        return normalizeNoteRef(value) === clean;
    });
}

function isSelfReference(noteName, target) {
    return normalizeNoteRef(noteName) === normalizeNoteRef(target);
}

function isValidLink(noteIndex, target) {
    const clean = normalizeNoteRef(target);
    for (const note of noteIndex) {
        if (normalizeTarget(note) === clean) {
            return true;
        }
    }
    return false;
}

module.exports = {
    normalizeNoteRef,
    isDuplicate,
    isSelfReference,
    isValidLink,
};
