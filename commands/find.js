const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const {
    searchFiles,
    searchByContent,
    fuzzySearchFiles,
    rankResults,
} = require("../utils/search");
const { error, info } = require("../utils/feedback");
const { select } = require("@inquirer/prompts");
const c = require("../utils/colors");

function normalizeExt(ext) {
    let e = String(ext || "").trim().toLowerCase();
    if (!e) return null;
    if (!e.startsWith(".")) e = `.${e}`;
    return e;
}

// Parses the optional `--limit` flag.
//
// Commander hands the raw flag value over as a string, so the CLI layer is
// where explicit parsing happens: only digits (a positive integer after
// trimming) are accepted. Numbers arriving from programmatic callers must
// already be positive integers. Anything else returns INVALID — values are
// never silently coerced or defaulted, so an invalid `--limit` can not
// quietly change which results are shown.
const INVALID_LIMIT = Symbol("invalid-limit");

function parseLimit(value) {
    if (value === undefined) return undefined;
    if (typeof value === "number") {
        return Number.isInteger(value) && value >= 1 ? value : INVALID_LIMIT;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (/^\d+$/.test(trimmed)) {
            const parsed = Number(trimmed);
            if (Number.isSafeInteger(parsed) && parsed >= 1) return parsed;
        }
        return INVALID_LIMIT;
    }
    return INVALID_LIMIT;
}

async function find(keyword, options = {}) {
    const vault = getVaultPath();

    const limit = parseLimit(options.limit);
    if (limit === INVALID_LIMIT) {
        error(
            `Nilai --limit tidak valid: ${options.limit}. Harus berupa bilangan bulat positif.`
        );
        return;
    }

    let root = vault;

    if (options.folder) {
        root = path.isAbsolute(options.folder)
            ? options.folder
            : path.join(vault, options.folder);

        if (!fs.existsSync(root)) {
            error(`Folder tidak ditemukan: ${options.folder}`);
            return;
        }
    }

    const ext = normalizeExt(options.type);
    const extensions = ext ? [ext] : undefined;

    let query;
    let results;

    if (options.content) {
        // searchByContent applies the limit after its own match-count
        // ordering, so the displayed results are simply the top ones.
        ({ query, results } = searchByContent(root, keyword, {
            extensions: extensions || [".md"],
            limit,
        }));
    } else if (options.fuzzy) {
        // fuzzySearchFiles applies the limit after its score ordering.
        ({ query, results } = fuzzySearchFiles(root, keyword, {
            extensions,
            limit,
        }));
    } else {
        // Default mode: rank the full traversal result set first (ranking
        // behavior is unchanged), then keep the top `limit` ranked results.
        // searchFiles() is deliberately unlimited here so the limit applies
        // to the ordering the user actually sees.
        ({ query, results } = searchFiles(root, keyword, { extensions }));
        results = rankResults(results, keyword);
        if (limit !== undefined && results.length > limit) {
            results = results.slice(0, limit);
        }
    }

    if (results.length === 0) {
        info("Tidak ada note yang ditemukan.");
        return;
    }

    if (options.pick && results.length > 1) {
        const choices = results.slice(0, 50).map((result) => ({
            name: result.relativePath,
            value: result,
        }));
        const chosen = await select({
            message: "Pilih note:",
            choices,
        });
        console.log(c.path(chosen.relativePath));
        return;
    }

    console.log(`Ditemukan ${c.value(results.length)} note\n`);

    if (options.content) {
        results.forEach((result) => {
            console.log(`${c.note(result.relativePath)} ${c.dim(`(line ${result.line})`)}`);
            if (result.snippet) {
                console.log(`  ${c.dim(result.snippet)}`);
            }
        });
    } else {
        results.forEach((result) => {
            console.log("📄", c.path(result.relativePath));
        });
    }
}

module.exports = find;
