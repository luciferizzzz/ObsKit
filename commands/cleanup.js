const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { buildNoteIndex } = require("../utils/noteIndex");
const { extractWikiLinks } = require("../utils/wikilinks");
const { confirm } = require("@inquirer/prompts");
const { error } = require("../utils/feedback");
const { createProgress } = require("../utils/progress");
const c = require("../utils/colors");

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function cleanup() {
    const vault = getVaultPath();

    console.log(`\n${c.heading("🧹 Vault Cleanup")}\n`);

    const dryRun = await confirm({
        message: "Dry run (show what would be deleted)?",
        default: true,
    });

    const files = scanMarkdownFiles(vault);
    const noteIndex = buildNoteIndex(files);

    const brokenLinks = [];
    const emptyFiles = [];
    const orphanFiles = [];
    const incoming = {};
    const fileBasename = new Map();

    for (const file of files) {
        const content = fs.readFileSync(file, "utf8");
        const links = extractWikiLinks(content);
        const name = path.basename(file, ".md");

        fileBasename.set(name, file);

        for (const link of links) {
            if (!noteIndex.has(link)) {
                brokenLinks.push({ file, link });
            }
            incoming[link] = (incoming[link] || 0) + 1;
        }

        const trimmed = content
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith("#") && !l.startsWith("<!--"));

        if (trimmed.length === 0) {
            emptyFiles.push(file);
        }
    }

    for (const file of files) {
        const name = path.basename(file, ".md");
        if (!incoming[name]) {
            orphanFiles.push(file);
        }
    }

    const totalSize = files.reduce(
        (sum, file) => sum + fs.statSync(file).size,
        0
    );

    console.log(`\n${c.heading("📊 Scan Results")}\n`);
    console.log(`Notes scanned : ${c.value(files.length)}`);
    console.log(`Total size    : ${c.value(formatSize(totalSize))}`);
    console.log(`Broken links  : ${c.value(brokenLinks.length)}`);
    console.log(`Empty files   : ${c.value(emptyFiles.length)}`);
    console.log(`Orphan files  : ${c.value(orphanFiles.length)}`);

    if (emptyFiles.length > 0) {
        console.log(`\n${c.heading("Empty files")}\n`);
        emptyFiles.forEach((file) => {
            const rel = path.relative(vault, file).split(path.sep).join("/");
            console.log(`  ${c.path(rel)}`);
        });
    }

    if (orphanFiles.length > 0) {
        console.log(`\n${c.heading("Orphan files (no incoming links)")}\n`);
        orphanFiles.slice(0, 15).forEach((file) => {
            const rel = path.relative(vault, file).split(path.sep).join("/");
            console.log(`  ${c.path(rel)}`);
        });
        if (orphanFiles.length > 15) {
            console.log(`  ${c.dim(`... dan ${orphanFiles.length - 15} lainnya`)}`);
        }
    }

    if (brokenLinks.length > 0) {
        console.log(`\n${c.heading("Broken links")}\n`);
        brokenLinks.slice(0, 15).forEach(({ file, link }) => {
            const rel = path.relative(vault, file).split(path.sep).join("/");
            console.log(`  ${c.path(rel)} → ${c.dim(`[[${link}]]`)}`);
        });
        if (brokenLinks.length > 15) {
            console.log(`  ${c.dim(`... dan ${brokenLinks.length - 15} lainnya`)}`);
        }
    }

    if (emptyFiles.length === 0 && orphanFiles.length === 0) {
        console.log(c.dim("\n✅ Nothing to clean up."));
        return;
    }

    const deletable = [...emptyFiles];
    const deletableSize = deletable.reduce(
        (sum, file) => sum + fs.statSync(file).size,
        0
    );

    if (dryRun) {
        console.log(`\n${c.heading("🧪 Dry run mode - nothing deleted.")}`);
        console.log(`Would delete : ${c.value(deletable.length)} empty file(s)`);
        console.log(`Space freed  : ${c.value(formatSize(deletableSize))}`);
        console.log(c.dim("\nOrphans are kept for review - run without dry run to delete empty files."));
        return;
    }

    const proceed = await confirm({
        message: `Delete ${deletable.length} empty file(s)?`,
        default: false,
    });

    if (!proceed) {
        console.log(c.dim("Cleanup cancelled."));
        return;
    }

    let deleted = 0;
    let freed = 0;

    const progress = createProgress({ total: deletable.length });

    for (const file of deletable) {
        try {
            freed += fs.statSync(file).size;
            fs.unlinkSync(file);
            deleted++;
        } catch (err) {
            error(`Error deleting ${file}: ${err.message}`);
        }

        progress.setText(path.relative(vault, file));
        progress.tick();
    }
    progress.stop();

    console.log("\n✅ Cleanup complete");
    console.log(`Deleted       : ${c.value(deleted)} file(s)`);
    console.log(`Space freed   : ${c.value(formatSize(freed))}`);
}

module.exports = cleanup;