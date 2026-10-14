const path = require("path");

// Vault index paths are POSIX-style relative paths, but hand-built indexes and
// Windows callers can hand over native separators. Normalizing once here keeps
// every caller from re-implementing it.
function toPosixPath(relPath) {
    return String(relPath || "")
        .split("\\")
        .join("/")
        .replace(/^\.\//, "");
}

// Folder that directly contains the note. Root-level notes return "" because
// "the vault root" is not a folder a user can move a note into.
function folderOf(relPath) {
    const posix = toPosixPath(relPath);
    const index = posix.lastIndexOf("/");

    if (index <= 0) {
        return "";
    }

    return posix.slice(0, index);
}

// True when `folder` is `other` itself or one of its ancestors. Suggesting an
// ancestor is pointless: a note in "Projects/Alpha" never needs to be told to
// move to "Projects" or to the vault root.
function isSelfOrAncestor(folder, other) {
    if (!folder || !other) {
        return false;
    }

    return other === folder || other.startsWith(folder + "/");
}

// Display form of a folder path: platform separators, so a Windows vault shows
// "Projects\Alpha" while the stored relPath stays POSIX.
function displayFolder(folder) {
    return String(folder || "").split("/").join(path.sep);
}

module.exports = {
    toPosixPath,
    folderOf,
    isSelfOrAncestor,
    displayFolder,
};