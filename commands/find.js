const { getVaultPath } = require("../utils/vault");
const { searchFiles } = require("../utils/search");
const { info } = require("../utils/feedback");

function find(keyword) {
    const vault = getVaultPath();

    const { results } = searchFiles(vault, keyword);

    if (results.length === 0) {
        info("Tidak ada note yang ditemukan.");
        return;
    }

    console.log(`Ditemukan ${results.length} note\n`);

    results.forEach(result => {
        console.log("📄", result.relativePath);
    });
}

module.exports = find;
