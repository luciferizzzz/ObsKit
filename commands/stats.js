const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const c = require("../utils/colors");

function stats() {
    const vault = getVaultPath();

    let totalNotes = 0;
    let totalFolders = 0;

    const folderStats = {};

    scan(vault);

    function scan(dir) {
        const files = fs.readdirSync(dir, {
            withFileTypes: true,
        });

        for (const file of files) {
            const fullPath = path.join(dir, file.name);

            if (file.isDirectory()) {
                totalFolders++;

                const relative = path.relative(vault, fullPath);

                if (!relative.includes(path.sep)) {
                    folderStats[file.name] = countMarkdown(fullPath);
                }

                scan(fullPath);
            } else if (file.name.endsWith(".md")) {
                totalNotes++;
            }
        }
    }

    function countMarkdown(dir) {
        let count = 0;

        const files = fs.readdirSync(dir, {
            withFileTypes: true,
        });

        for (const file of files) {
            const fullPath = path.join(dir, file.name);

            if (file.isDirectory()) {
                count += countMarkdown(fullPath);
            } else if (file.name.endsWith(".md")) {
                count++;
            }
        }

        return count;
    }

    console.log(`\n${c.heading("📊 Vault Statistics")}\n`);

    console.log(`📄 ${c.title("Total Notes")} : ${c.value(totalNotes)}`);
    console.log(`📁 ${c.title("Total Folder")}: ${c.value(totalFolders)}`);

    console.log(`\n${c.heading("Folder")}\n`);

    for (const folder in folderStats) {
        console.log(`📂 ${c.folder(folder.padEnd(15))} ${c.value(folderStats[folder])}`);
    }
}

module.exports = stats;