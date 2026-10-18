const fs = require("fs");
const path = require("path");

const DEFAULT_EXCLUDE_DIRS = [".git", ".obsidian", "node_modules"];

function normalizeQuery(query) {
    return String(query || "").trim().toLowerCase();
}

// Convert a vault-relative path to forward-slash form so results look the
// same on every platform. Only the platform separator is replaced, never
// every backslash: a backslash can be a valid filename character on POSIX.
function normalizeRelativePath(relativePath) {
    return relativePath.split(path.sep).join("/");
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
                relativePath: normalizeRelativePath(path.relative(root, file)),
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
                relativePath: normalizeRelativePath(path.relative(root, file)),
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

// Position-preserving case-insensitive match.
//
// The previous implementation searched `content.toLowerCase()` and used the
// resulting index to slice the *original* `content`. Those indices only line
// up while toLowerCase() preserves string length; e.g. "İ" (U+0130) folds to
// two code units, shifting every later offset by one (wrong line numbers and
// truncated snippets).
//
// This scan instead folds one code point at a time starting from each
// candidate position of the original string. The accumulated fold must stay
// a prefix of the query (so most positions bail out after one character) and
// a match is only confirmed when the fold length equals the query length
// exactly. Because `index` and `end` are produced while advancing through
// `content` itself, they are indices into the original text by construction
// and remain valid for slicing it. `toLowerCase()` is still the folding
// primitive, so case-insensitive matching behaves as before.
//
// Returns `{ index, end }` for the first match at or after `fromIndex`, or
// null. `end` is strictly greater than `index` for any match, so callers can
// resume at `end` without rescanning matched positions.
function findFoldMatch(content, query, fromIndex) {
    if (!query) return null;

    for (let i = Math.max(0, fromIndex); i < content.length; i++) {
        let folded = "";
        let j = i;
        let viable = true;

        while (folded.length < query.length) {
            if (j >= content.length) {
                viable = false;
                break;
            }

            // Consume a whole code point so the folds of characters outside
            // the BMP (mapped across a surrogate pair) stay aligned.
            let next = j + 1;
            const code = content.charCodeAt(j);
            if (
                code >= 0xd800 &&
                code <= 0xdbff &&
                next < content.length &&
                content.charCodeAt(next) >= 0xdc00 &&
                content.charCodeAt(next) <= 0xdfff
            ) {
                next++;
            }

            folded += content.slice(j, next).toLowerCase();
            j = next;

            if (!query.startsWith(folded)) {
                viable = false;
                break;
            }
        }

        if (viable && folded.length === query.length) {
            return { index: i, end: j };
        }
    }

    return null;
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

        const snippets = [];
        let match = findFoldMatch(content, normalized, 0);
        let line = 1;
        let matches = 0;

        while (match && snippets.length < maxSnippets) {
            line = 1 + (content.slice(0, match.index).match(/\n/g) || []).length;
            const start = Math.max(0, match.index - contextRadius);
            const end = Math.min(content.length, match.end + contextRadius);
            snippets.push(content.slice(start, end).replace(/\r?\n/g, " ").trim());
            matches++;
            match = findFoldMatch(content, normalized, match.end);
        }

        if (matches === 0) continue;

        results.push({
            name: path.basename(file),
            path: file,
            relativePath: normalizeRelativePath(path.relative(root, file)),
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
