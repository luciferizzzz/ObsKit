const { getVaultPath } = require("../utils/vault");
const { buildVaultIndex } = require("../utils/vaultIndex");
const { analyzeVaultIndex } = require("../checks/health");
const { info, success, warning } = require("../utils/feedback");
const c = require("../utils/colors");

const DETAIL_LIMIT = 15;

function formatSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function printCounts(heading, rows) {
    console.log(`\n${c.heading(heading)}\n`);

    const shown = rows.filter(([, count]) => count > 0);

    if (shown.length === 0) {
        console.log(c.dim("  None."));
        return;
    }

    for (const [label, count] of shown) {
        console.log(`  ${label.padEnd(24)} ${c.value(count)}`);
    }
}

function printDetails(result, options) {
    if (!options.verbose) {
        return;
    }

    const sections = [
        ["Broken Links", result.details.brokenLinks, (item) => `${item.file} → [[${item.link}]]`],
        ["Orphan Notes", result.details.orphans, (item) => item],
        ["Empty Notes", result.details.emptyNotes, (item) => item],
        ["Missing Tags", result.details.missingTags, (item) => item],
        ["No Outgoing Links", result.details.noOutgoing, (item) => item],
        ["Duplicate Names", result.details.duplicates, (item) => item],
        ["Malformed Frontmatter", result.details.malformedFrontmatter, (item) => item],
        ["Stale Notes", result.details.staleNotes, (item) => `${item.file} (${item.days} days)`],
        ["Large Notes", result.details.largeNotes, (item) => `${item.file} (${formatSize(item.size)})`],
    ];

    for (const [label, items, fmt] of sections) {
        if (items.length === 0) {
            continue;
        }

        console.log(`\n${c.heading(label)}\n`);

        items.slice(0, DETAIL_LIMIT).forEach((item) => {
            console.log(`  ${c.path(fmt(item))}`);
        });

        if (items.length > DETAIL_LIMIT) {
            console.log(c.dim(`  ... dan ${items.length - DETAIL_LIMIT} lainnya`));
        }
    }
}

function doctor(options = {}) {
    const vault = getVaultPath();
    const index = buildVaultIndex(vault);

    if (index.notes.length === 0) {
        info("Vault kosong. Tidak ada note ditemukan.");
        return;
    }

    const result = analyzeVaultIndex(index);

    if (options.json) {
        const json = {
            vault,
            notesScanned: result.notesScanned,
            issues: {
                brokenLinks: result.brokenLinks,
                orphanNotes: result.orphanNotes,
                emptyNotes: result.emptyNotes,
                duplicates: result.duplicates,
                missingTags: result.missingTags,
                noOutgoing: result.noOutgoing,
                malformedFrontmatter: result.malformedFrontmatter,
            },
            warnings: {
                staleNotes: result.staleNotes,
                largeNotes: result.largeNotes,
            },
            duplicateNames: result.duplicateNames,
            score: result.score,
            rating: result.rating,
        };

        if (options.verbose) {
            json.details = result.details;
        }

        console.log(JSON.stringify(json, null, 2));
        return;
    }

    console.log(`\n${c.heading("🩺 Vault Doctor")}\n`);
    console.log(`Notes scanned : ${c.value(result.notesScanned)}`);

    printCounts("Issues", [
        ["Broken Links", result.brokenLinks],
        ["Orphan Notes", result.orphanNotes],
        ["Empty Notes", result.emptyNotes],
        ["Missing Tags", result.missingTags],
        ["No Outgoing Links", result.noOutgoing],
        ["Duplicate Names", result.duplicates],
        ["Malformed Frontmatter", result.malformedFrontmatter],
    ]);

    printCounts("Warnings", [
        ["Stale Notes (30d)", result.staleNotes],
        ["Large Notes (200KB)", result.largeNotes],
    ]);

    printDetails(result, options);

    console.log(`\n${c.heading("Health Score")}\n`);
    console.log(`  Score         : ${c.value(`${result.score}/100`)}`);
    console.log(`  Rating        : ${c.value(result.rating)}`);

    const totalIssues =
        result.brokenLinks +
        result.orphanNotes +
        result.emptyNotes +
        result.duplicates +
        result.missingTags +
        result.noOutgoing +
        result.malformedFrontmatter;

    if (totalIssues === 0) {
        console.log("");
        success("Vault Healthy");
    } else {
        console.log("");
        warning("Beberapa masalah ditemukan. Cek verbose untuk detail.");
    }
}

module.exports = doctor;