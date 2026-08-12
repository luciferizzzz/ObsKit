const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { extractWikiLinks } = require("../utils/wikilinks");
const { error, info } = require("../utils/feedback");

function backlinks(note) {
    const vault = getVaultPath();

    // 1. Scan every markdown file in the vault
    const files = scanMarkdownFiles(vault);

    // 2. Check if the requested note exists as a file in the vault
    const targetFile = path.join(vault, note + ".md");
    if (!fs.existsSync(targetFile)) {
        error(`Note not found: ${note}`);
        return;
    }

    // 3. Collect every note that references the target note
    const referencing = [];

    for (const file of files) {
        // Skip the target file itself — a note cannot backlink to itself
        if (path.resolve(file) === path.resolve(targetFile)) {
            continue;
        }

        const content = fs.readFileSync(file, "utf-8");
        const links = extractWikiLinks(content);

        // 4. Compare each extracted link against the requested note (case-insensitive)
        //    Also strip any heading fragment (#Heading) that extractWikiLinks preserves
        const found = links.some((link) => {
            const clean = link.split("#")[0].trim().toLowerCase();
            return clean === note.toLowerCase();
        });

        if (found) {
            // 5. Normalize path separators to "/" and make relative to vault root
            const rel = path.relative(vault, file).split(path.sep).join("/");
            referencing.push(rel);
        }
    }

    // 6. Print results
    if (referencing.length === 0) {
        info("No backlinks found.");
        return;
    }

    console.log("Backlinks\n");

    referencing.forEach((file) => {
        console.log(file);
    });

    console.log(`\n-----------------------`);
    console.log(`Total Backlinks: ${referencing.length}`);
}

module.exports = backlinks;
