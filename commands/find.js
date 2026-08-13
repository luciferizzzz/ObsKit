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

async function find(keyword, options = {}) {
    const vault = getVaultPath();

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
        ({ query, results } = searchByContent(root, keyword, {
            extensions: extensions || [".md"],
        }));
    } else if (options.fuzzy) {
        ({ query, results } = fuzzySearchFiles(root, keyword, { extensions }));
    } else {
        ({ query, results } = searchFiles(root, keyword, { extensions }));
        results = rankResults(results, keyword);
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
