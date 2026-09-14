function sanitizeFilename(name) {
    return String(name)
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f<>:"/\\|?*]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\.+$/g, "");
}

function mdFileName(title) {
    return sanitizeFilename(title).replace(/\.md$/i, "") + ".md";
}

module.exports = sanitizeFilename;
module.exports.sanitizeFilename = sanitizeFilename;
module.exports.mdFileName = mdFileName;
