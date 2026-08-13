const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { extractWikiLinks } = require("../utils/wikilinks");
const {
    buildNoteIndex,
    buildNormalizedNoteIndex,
    buildFilePathMap,
} = require("../utils/noteIndex");
const c = require("../utils/colors");

function graph() {
    const vault = getVaultPath();

    // 1. Scan every markdown file in the vault
    const files = scanMarkdownFiles(vault);

    // 2. Build an index of all note names (basename without .md)
    const allNotes = buildNoteIndex(files);
    const normalizedNotes = buildNormalizedNoteIndex(files);
    const fileByNote = buildFilePathMap(files);

    // 3. Track incoming and outgoing links per note
    const incoming = {};
    const outgoing = {};
    let totalLinks = 0;
    let brokenCount = 0;

    for (const file of files) {
        const noteName = path.basename(file, ".md");
        const content = fs.readFileSync(file, "utf-8");
        const links = extractWikiLinks(content);

        outgoing[noteName] = links.length;
        totalLinks += links.length;

        for (const link of links) {
            const clean = link.split("#")[0].trim().toLowerCase();

            // Set lookup is O(1) instead of scanning the whole index per link
            if (normalizedNotes.has(clean)) {
                if (!incoming[clean]) {
                    incoming[clean] = 0;
                }
                incoming[clean]++;
            } else {
                brokenCount++;
            }
        }
    }

    // 4. Calculate orphan notes (notes with no incoming links)
    const orphanNotes = [];
    for (const note of allNotes) {
        if (!incoming[note.toLowerCase()]) {
            // Map lookup is O(1) instead of scanning the file list per note
            const file = fileByNote.get(note);
            if (file) {
                orphanNotes.push(
                    path.relative(vault, file).split(path.sep).join("/")
                );
            }
        }
    }

    // 5. Calculate average outgoing links
    const noteCount = allNotes.size;
    const avgLinks = noteCount > 0 ? (totalLinks / noteCount).toFixed(2) : "0.00";

    // 6. Sort notes by outgoing link count (descending)
    const sortedNotes = Object.entries(outgoing)
        .sort((a, b) => b[1] - a[1]);

    // 7. Display summary
    console.log(`\n${c.heading("📊 Vault Graph")}\n`);

    console.log(`${c.title("Notes")}          : ${c.value(noteCount)}`);
    console.log(`${c.title("Wiki Links")}     : ${c.value(totalLinks)}`);
    console.log(`${c.title("Broken Links")}   : ${c.value(brokenCount)}`);
    console.log(`${c.title("Orphan Notes")}   : ${c.value(orphanNotes.length)}`);
    console.log(`${c.title("Average Links")}  : ${c.value(avgLinks)}`);

    // 8. Display most linked notes (top 5)
    const mostLinked = sortedNotes.slice(0, 5);
    if (mostLinked.length > 0) {
        console.log(`\n${c.heading("Most Linked Notes")}\n`);
        mostLinked.forEach(([note, count], i) => {
            console.log(`${i + 1}. ${c.note(note)} ${c.dim(`(${count})`)}`);
        });
    }

    // 9. Display least linked notes (bottom 5)
    const leastLinked = sortedNotes.slice(-5).reverse();
    if (leastLinked.length > 0) {
        console.log(`\n${c.heading("Least Linked Notes")}\n`);
        leastLinked.forEach(([note, count], i) => {
            console.log(`${i + 1}. ${c.note(note)} ${c.dim(`(${count})`)}`);
        });
    }

    // 10. Display broken links if any
    if (brokenCount > 0) {
        console.log(`\n${c.divider("------------------------")}`);
        console.log(`${c.title("Total Broken Links")}: ${c.value(brokenCount)}`);
    }
}

module.exports = graph;
