const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const relationship = require("../utils/relationship");

function relate(note, related) {
    const vault = getVaultPath();
    const files = scanMarkdownFiles(vault);

    const { findNoteFile } = relationship.scanner;
    const { addRelatedToFile } = relationship.editor;
    const { isSelfReference } = relationship.validator;
    const { formatAddResult, formatSelfReferenceResult } = relationship.formatter;

    const noteFile = findNoteFile(files, note);
    if (!noteFile) {
        console.log(`Note not found: ${note}`);
        return;
    }

    const relatedFile = findNoteFile(files, related);
    if (!relatedFile) {
        console.log(`Related note not found: ${related}`);
        return;
    }

    const noteName = path.basename(noteFile, ".md");
    const relatedName = path.basename(relatedFile, ".md");

    if (isSelfReference(noteName, relatedName)) {
        console.log(formatSelfReferenceResult(noteName));
        return;
    }

    const result = addRelatedToFile(noteFile, relatedName);

    console.log(formatAddResult(noteName, relatedName, result.added));
}

module.exports = relate;
