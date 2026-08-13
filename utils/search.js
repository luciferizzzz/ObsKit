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

function fuzzyScore(query, text) {
    const q = normalizeQuery(query);
    const t = String(text).toLowerCase();

    if (!q) return null;

    if (t === q) {
        return 1000 + q.length * 2;
    }

    if (t.startsWith(q)) {
        return 800 + q.length * 2;
    }

    const sub = t.indexOf(q);
    if (sub !== -1) {
        return 500 - sub + q.length * 2;
    }

    let ti = 0;
    let prev = -1;
    let streak = 0;
    let score = 0;

    for (let i = 0; i < q.length; i++) {
        const found = t.indexOf(q[i], ti);
        if (found === -1) return null;

        if (prev !== -1 && found === prev + 1) {
            streak++;
            score += 5 + streak;
        } else {
            streak = 0;
            score += 1;
        }

        if (i === 0 && found === 0) score += 20;

        prev = found;
        ti = found + 1;
    }

    score -= t.length;
    return score;
}

function fuzzyMatches(query, text) {
    return fuzzyScore(query, text) !== null;
}

function fuzzySearchFiles(root, query, options = {}) {
    const normalized = normalizeQuery(query);

    if (!normalized) {
        return { query: normalized, results: [] };
    }

    const files = walkFiles(root, options);
    const results = [];

    for (const file of files) {
        const name = path.basename(file);
        const score = fuzzyScore(normalized, name);

        if (score !== null) {
            results.push({
                name,
                path: file,
                relativePath: path.relative(root, file),
                score,
            });
        }
    }

    results.sort(
        (a, b) =>
            b.score - a.score ||
            a.relativePath.length - b.relativePath.length
    );

    return { query: normalized, results };
}

function fuzzySearchNotes(root, query, options = {}) {
    return fuzzySearchFiles(root, query, {
        ...options,
        extensions: [".md"],
    });
}

function rankResults(results, query) {
    return results
        .map((result) => ({
            ...result,
            score: fuzzyScore(query, result.name),
        }))
        .sort(
            (a, b) =>
                (b.score === null ? -1 : b.score) -
                    (a.score === null ? -1 : a.score) ||
                a.relativePath.length - b.relativePath.length
        );
}

function searchByContent(root, query, options = {}) {
    const normalized = normalizeQuery(query);

    if (!normalized) {
        return { query: normalized, results: [] };
    }

    const excludeDirs = options.excludeDirs || DEFAULT_EXCLUDE_DIRS;
    const extensions = options.extensions || [".md"];
    const maxBytes = options.maxBytes || 1024 * 1024;
    const contextRadius = options.contextRadius ?? 40;
    const maxSnippets = options.maxSnippets || 5;

    const files = walkFiles(root, { excludeDirs, extensions });
    const results = [];

    for (const file of files) {
        let content;
        try {
            const stat = fs.statSync(file);
            if (stat.size > maxBytes) continue;
            content = fs.readFileSync(file, "utf8");
        } catch {
            continue;
        }

        const lower = content.toLowerCase();
        const snippets = [];
        let idx = lower.indexOf(normalized);
        let line = 1;
        let matches = 0;

        while (idx !== -1 && snippets.length < maxSnippets) {
            line = 1 + (content.slice(0, idx).match(/\n/g) || []).length;
            const start = Math.max(0, idx - contextRadius);
            const end = Math.min(content.length, idx + normalized.length + contextRadius);
            snippets.push(content.slice(start, end).replace(/\r?\n/g, " ").trim());
            matches++;
            idx = lower.indexOf(normalized, idx + normalized.length);
        }

        if (matches === 0) continue;

        results.push({
            name: path.basename(file),
            path: file,
            relativePath: path.relative(root, file),
            line,
            matches,
            snippet: snippets[0] || "",
            snippets,
        });
    }

    results.sort(
        (a, b) =>
            b.matches - a.matches ||
            a.relativePath.localeCompare(b.relativePath)
    );

    return { query: normalized, results };
}

module.exports = {
    DEFAULT_EXCLUDE_DIRS,
    normalizeQuery,
    fileNameMatches,
    walkFiles,
    searchFiles,
    searchNotes,
    fuzzyScore,
    fuzzyMatches,
    fuzzySearchFiles,
    fuzzySearchNotes,
    rankResults,
    searchByContent,
};
