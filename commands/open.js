const { exec } = require("child_process");

const { getVaultPath } = require("../utils/vault");
const { searchFiles } = require("../utils/search");
const { error, success } = require("../utils/feedback");
const c = require("../utils/colors");

function open(keyword) {
    const vault = getVaultPath();

    // Delegates to the shared searchFiles() implementation: same
    // case-insensitive filename matching, same readdir depth-first traversal
    // order, all extensions, and no exclusion directories — matching the
    // behavior of the traversal this replaced. `relativePath` is already
    // normalized to forward slashes by searchFiles().
    const { results } = searchFiles(vault, keyword);

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
