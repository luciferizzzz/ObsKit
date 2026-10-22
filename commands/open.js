const { exec } = require("child_process");

const { getVaultPath } = require("../utils/vault");
const { searchFiles } = require("../utils/search");
const { error, success } = require("../utils/feedback");
const c = require("../utils/colors");

function open(keyword) {
    const vault = getVaultPath();

    // The keyword is trimmed before searching, so " Rust " searches for
    // "Rust". An empty (or whitespace-only) keyword keeps the original
    // behavior of matching every file, so the whole vault is listed instead
    // of reporting "Note tidak ditemukan.".
    const normalizedKeyword = String(keyword || "").trim();

    // Delegates to the shared searchFiles() implementation: same
    // case-insensitive filename matching, same readdir depth-first traversal
    // order, all extensions, and no exclusion directories — matching the
    // behavior of the traversal this replaced. `relativePath` is already
    // normalized to forward slashes by searchFiles().
    const { results } = searchFiles(vault, normalizedKeyword, {
        matchAllWhenEmpty: normalizedKeyword === "",
    });

    if (results.length === 0) {
        error("Note tidak ditemukan.");
        return;
    }

    if (results.length > 1) {
        console.log(c.title("Ditemukan beberapa note:"));

        results.forEach((result, index) => {
            console.log(`${index + 1}. ${c.note(result.relativePath)}`);
        });

        return;
    }

    exec(`start "" "${results[0].path}"`);

    success("Membuka note...");
}

module.exports = open;
