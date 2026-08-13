const path = require("path");
const { exec } = require("child_process");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { info } = require("../utils/feedback");
const c = require("../utils/colors");

function random(options) {
    const vault = getVaultPath();
    const files = scanMarkdownFiles(vault);

    if (files.length === 0) {
        info("Vault contains no notes.");
        return;
    }

    // Pick a random note from the list
    const picked = files[Math.floor(Math.random() * files.length)];

    // Normalize path separators to "/"
    const relative = path.relative(vault, picked).split(path.sep).join("/");

    console.log(`\n${c.heading("🎲 Random Note")}\n`);
    console.log(c.note(relative));

    // Open the note if --open flag is provided
    if (options.open) {
        exec(`start "" "${picked}"`);
        console.log(c.dim("\nMembuka note..."));
    }
}

module.exports = random;
