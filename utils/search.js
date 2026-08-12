const fs = require("fs");
const path = require("path");

const DEFAULT_EXCLUDE_DIRS = [".git", ".obsidian", "node_modules"];

function normalizeQuery(query) {
    return String(query || "").trim().toLowerCase();
}

function fileNameMatches(name, query) {
    const q = normalizeQuery(query);
    if (!q) return false;
    return String(name).toLowerCase().includes(q);
}

function walkFiles(root, options = {}) {
    const excludeDirs = options.excludeDirs;
    const extensions = options.extensions;
    const files = [];

    function walk(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (excludeDirs && excludeDirs.includes(entry.name)) continue;
                walk(fullPath);
            } else if (
                !extensions ||
                extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))
            ) {
                files.push(fullPath);
            }
        }
    }

    walk(root);

    return files;
}

function searchFiles(root, query, options = {}) {
    const normalized = normalizeQuery(query);

    if (!normalized) {
        return { query: normalized, results: [] };
    }

    const files = walkFiles(root, options);
    const results = [];

    for (const file of files) {
        const name = path.basename(file);
        if (fileNameMatches(name, normalized)) {
            results.push({
                name,
                path: file,
                relativePath: path.relative(root, file),
            });
        }
    }

    return { query: normalized, results };
}

function searchNotes(root, query, options = {}) {
    return searchFiles(root, query, {
        ...options,
        extensions: [".md"],
    });
}

module.exports = {
    DEFAULT_EXCLUDE_DIRS,
    normalizeQuery,
    fileNameMatches,
    walkFiles,
    searchFiles,
    searchNotes,
};
