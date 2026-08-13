const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { buildNoteIndex } = require("../utils/noteIndex");
const { extractWikiLinks } = require("../utils/wikilinks");
const c = require("../utils/colors");

function orphan() {
    const vault = getVaultPath();

    // 1. Scan every markdown file in the vault
    const files = scanMarkdownFiles(vault);

    // 2. Build an index of all note names (basename without .md)
    const allNotes = buildNoteIndex(files);

    // 3. Collect every note name that is referenced by at least one wiki link
    const referenced = new Set();

    for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        const links = extractWikiLinks(content);

        for (const link of links) {
            // Strip heading fragment (#Heading) before comparing
            const clean = link.split("#")[0].trim().toLowerCase();

            // Find the matching note name in our index (case-insensitive)
            for (const note of allNotes) {
                if (note.toLowerCase() === clean) {
                    referenced.add(note);
                    break;
                }
            }
        }
    }

    // 4. Determine orphan notes: notes that are never referenced
    const orphans = [];

    for (const note of allNotes) {
        if (!referenced.has(note)) {
            // Find the full path for this note
            const file = files.find(
                (f) => path.basename(f, ".md") === note
            );

            if (file) {
                const rel = path
                    .relative(vault, file)
                    .split(path.sep)
                    .join("/");
                orphans.push(rel);
            }
        }
    }

    // 5. Sort alphabetically
    orphans.sort();

    // 6. Print results
    if (orphans.length === 0) {
        console.log("\u2714 No orphan notes found.");
        return;
    }

    console.log(`\n${c.heading("🌱 Orphan Notes")}\n`);

    orphans.forEach((file) => {
        console.log(c.note(file));
    });

    console.log(`\n${c.divider("------------------------")}`);
    console.log(`${c.title("Total Orphan Notes")}: ${c.value(orphans.length)}`);
}

module.exports = orphan;
