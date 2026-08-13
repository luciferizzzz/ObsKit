const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { info } = require("../utils/feedback");
const c = require("../utils/colors");

function list() {
    const vault = getVaultPath();

    // Get all markdown files in the vault
    const files = scanMarkdownFiles(vault);

    // Filter out hidden directories (.obsidian, .git, etc.)
    const visible = files.filter((file) => {
        const relative = path.relative(vault, file);
        const parts = relative.split(path.sep);
        return !parts.some((part) => part.startsWith("."));
    });

    // Sort alphabetically by relative path
    const sorted = visible
        .map((file) => path.relative(vault, file).split(path.sep).join("/"))
        .sort((a, b) => a.localeCompare(b));

    if (sorted.length === 0) {
        info("No notes found in the vault.");
        return;
    }

    console.log(`\n${c.heading("📚 Notes")}\n`);

    sorted.forEach((note) => {
        console.log(c.note(note));
    });

    console.log(`\n${c.divider("-----------------------")}`);
    console.log(`${c.title("Total Notes")}: ${c.value(sorted.length)}`);
}

module.exports = list;
