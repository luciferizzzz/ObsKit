const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { info } = require("../utils/feedback");

function recent(limit) {
    const vault = getVaultPath();
    const files = scanMarkdownFiles(vault);

    if (files.length === 0) {
        info("Tidak ada note dalam vault.");
        return;
    }

    // Get modification time for each file and sort by newest first
    const entries = files.map((file) => ({
        path: path.relative(vault, file).split(path.sep).join("/"),
        mtime: fs.statSync(file).mtime,
    }));

    entries.sort((a, b) => b.mtime - a.mtime);

    // Apply limit (default: 10)
    const max = parseInt(limit) || 10;
    const shown = entries.slice(0, max);

    console.log("\n🕒 Recent Notes\n");

    shown.forEach((entry, index) => {
        const date = entry.mtime;
        const formatted =
            `${date.getFullYear()}-` +
            `${String(date.getMonth() + 1).padStart(2, "0")}-` +
            `${String(date.getDate()).padStart(2, "0")} ` +
            `${String(date.getHours()).padStart(2, "0")}:` +
            `${String(date.getMinutes()).padStart(2, "0")}`;

        console.log(`${index + 1}. ${entry.path}`);
        console.log(`   Modified: ${formatted}\n`);
    });

    console.log("────────────────────────");
    console.log(`Showing ${shown.length} of ${entries.length} notes.`);
}

module.exports = recent;
