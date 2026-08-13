const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { info } = require("../utils/feedback");
const c = require("../utils/colors");

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

    console.log(`\n${c.heading("🕒 Recent Notes")}\n`);

    shown.forEach((entry, index) => {
        const date = entry.mtime;
        const formatted =
            `${date.getFullYear()}-` +
            `${String(date.getMonth() + 1).padStart(2, "0")}-` +
            `${String(date.getDate()).padStart(2, "0")} ` +
            `${String(date.getHours()).padStart(2, "0")}:` +
            `${String(date.getMinutes()).padStart(2, "0")}`;

        console.log(`${index + 1}. ${c.note(entry.path)}`);
        console.log(`   ${c.dim(`Modified: ${formatted}`)}\n`);
    });

    console.log(c.divider("────────────────────────"));
    console.log(`Showing ${c.value(shown.length)} of ${c.value(entries.length)} notes.`);
}

module.exports = recent;
