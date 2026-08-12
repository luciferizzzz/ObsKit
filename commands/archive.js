const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { input, confirm } = require("@inquirer/prompts");
const { error, info } = require("../utils/feedback");

function formatDate(date) {
    return (
        `${date.getFullYear()}-` +
        `${String(date.getMonth() + 1).padStart(2, "0")}-` +
        `${String(date.getDate()).padStart(2, "0")}`
    );
}

async function archive() {
    const vault = getVaultPath();

    console.log("\n📦 Archive Notes\n");

    const daysInput = await input({
        message: "Archive notes older than how many days? (default: 30)",
        default: "30",
    });

    const days = parseInt(daysInput, 10);

    if (isNaN(days) || days <= 0) {
        error("Invalid number of days.");
        return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const files = scanMarkdownFiles(vault);
    const toArchive = [];

    for (const file of files) {
        const stat = fs.statSync(file);

        if (stat.mtime < cutoffDate) {
            toArchive.push(file);
        }
    }

    if (toArchive.length === 0) {
        info(`No notes older than ${days} days found.`);
        return;
    }

    console.log(`\nNotes older than ${days} days: ${toArchive.length}\n`);

    toArchive.forEach((file) => {
        const rel = path.relative(vault, file).split(path.sep).join("/");
        const stat = fs.statSync(file);
        const mtime = formatDate(stat.mtime);
        console.log(`  ${rel}  (modified: ${mtime})`);
    });

    const proceed = await confirm({
        message: `Move ${toArchive.length} notes to archive folder?`,
        default: true,
    });

    if (!proceed) {
        console.log("Archive cancelled.");
        return;
    }

    const archiveFolder = path.join(vault, "Archive");
    fs.mkdirSync(archiveFolder, { recursive: true });

    let moved = 0;
    let failed = 0;

    for (const file of toArchive) {
        const rel = path.relative(vault, file);
        const dest = path.join(archiveFolder, rel);

        try {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.renameSync(file, dest);
            moved++;
        } catch (err) {
            console.error(`Failed to move ${rel}: ${err.message}`);
            failed++;
        }
    }

    console.log(`\n✅ Archive complete`);
    console.log(`Moved: ${moved}`);
    if (failed > 0) {
        console.log(`Failed: ${failed}`);
    }
}

module.exports = archive;