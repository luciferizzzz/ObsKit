const { getVaultPath } = require("../utils/vault");
const { buildVaultIndex } = require("../utils/vaultIndex");
const { analyzeVaultIndex } = require("../checks/health");
const { collectDiagnostics } = require("../checks/diagnostics");
const { buildIntegrityReport } = require("../checks/integrity");
const { info, success, warning } = require("../utils/feedback");
const c = require("../utils/colors");

const DETAIL_LIMIT = 15;

// Diagnostics whose items are already printed by the classic verbose detail
// sections above, so verbose mode never shows the same file twice.
const SHARED_DETAIL_CODES = new Set([
    "RELATIONSHIP_BROKEN_LINK",
    "NOTE_ORPHAN",
    "NOTE_BASENAME_COLLISION",
    "METADATA_MALFORMED_FRONTMATTER",
]);

const DIAGNOSTIC_ITEM_FORMATTERS = {
    RELATIONSHIP_AMBIGUOUS_TARGET: (item) =>
        `${item.file} → [[${item.link}]] (${item.matches.join(", ")})`,
    RELATIONSHIP_SELF_LINK: (item) => `${item.file} → [[${item.link}]]`,
    NOTE_ISOLATED: (item) => item,
    TAG_SPELLING_VARIANT: (item) => `${item.variants.join(" / ")} (${item.notes.join(", ")})`,
    TAG_SINGLE_USE: (item) => `${item.tag} (${item.note})`,
    METADATA_DUPLICATE_KEY: (item) => `${item.file} (${item.keys.join(", ")})`,
};

function severityLabel(severity) {
    const label = severity.padEnd(9);
    if (severity === "error") return c.error(label);
    if (severity === "warning") return c.warning(label);
    return c.dim(label);
}

const INTEGRITY_CATEGORY_LABELS = [
    ["links", "Broken wiki-links"],
    ["references", "Ambiguous references"],
    ["basenames", "Duplicate basenames"],
    ["attachments", "Missing attachments"],
    ["metadata", "Metadata issues"],
    ["tags", "Tag issues"],
];

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

function printDiagnostics(diagnostics, options) {
    console.log(`\n${c.heading("Diagnostics")}\n`);

    if (diagnostics.length === 0) {
        console.log(c.dim("  None."));
        return;
    }

    for (const diagnostic of diagnostics) {
        console.log(
            `  ${severityLabel(diagnostic.severity)} ` +
                `${c.title(diagnostic.code.padEnd(32))} ` +
                `${c.value(String(diagnostic.count).padStart(4))}  ` +
                diagnostic.title
        );
        console.log(`  ${c.dim(diagnostic.action)}`);

        if (!options.verbose || SHARED_DETAIL_CODES.has(diagnostic.code)) {
            continue;
        }

        const format = DIAGNOSTIC_ITEM_FORMATTERS[diagnostic.code];
        if (!format) continue;

        diagnostic.items.slice(0, DETAIL_LIMIT).forEach((item) => {
            console.log(`    ${c.path(format(item))}`);
        });

        if (diagnostic.items.length > DETAIL_LIMIT) {
            console.log(c.dim(`    ... dan ${diagnostic.items.length - DETAIL_LIMIT} lainnya`));
        }
    }
}

function printIntegritySummary(integrity, options) {
    console.log(`\n${c.heading("Vault Integrity")}\n`);

    const summary = integrity.summary;
    console.log(`  ${"Errors".padEnd(20)} ${c.value(summary.errors)}`);
    console.log(`  ${"Warnings".padEnd(20)} ${c.value(summary.warnings)}`);
    console.log(`  ${"Info".padEnd(20)} ${c.value(summary.info)}`);
    console.log(`  ${"Affected notes".padEnd(20)} ${c.value(summary.affectedNotes)}`);

    const categories = INTEGRITY_CATEGORY_LABELS.filter(
        ([key]) => summary.categories[key] > 0
    );

    if (categories.length > 0) {
        console.log("");
        for (const [key, label] of categories) {
            console.log(`  ${label.padEnd(20)} ${c.value(summary.categories[key])}`);
        }
    }

    if (options.note) {
        const suffix = integrity.filterMatched ? "" : " (no matching note)";
        console.log(c.dim(`\n  Filter: ${options.note}${suffix}`));
    }

    if (summary.total === 0) {
        console.log("");
        console.log(
            "  " +
                (options.note
                    ? "No integrity issues found for this note."
                    : "No integrity issues found.")
        );
    } else if (!options.verbose) {
        console.log("");
        console.log(c.dim("  Use `obs doctor --verbose` to inspect individual issues."));
    }
}

function printIntegrityDetails(integrity) {
    if (integrity.diagnostics.length === 0) {
        return;
    }

    console.log(`\n${c.heading("Integrity Issues")}\n`);

    for (const item of integrity.diagnostics) {
        console.log(`[${item.severity.toUpperCase()}] ${item.code}`);
        console.log(`File: ${item.path || "(vault)"}`);

        if (item.line !== null && item.line !== undefined) {
            console.log(`Line: ${item.line}`);
        }

        if (item.target) {
            console.log(`Target: ${item.target}`);
        }

        console.log(`Reason: ${item.message}`);
        console.log(`Action: ${item.action}`);

        if (item.related && item.related.length > 0) {
            console.log(`Related: ${item.related.join(", ")}`);
        }

        console.log("");
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
    const diagnostics = collectDiagnostics(index, { health: result });
    const integrity = buildIntegrityReport(index, { note: options.note });

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
            diagnostics: diagnostics.map((diagnostic) => {
                const entry = {
                    code: diagnostic.code,
                    severity: diagnostic.severity,
                    title: diagnostic.title,
                    message: diagnostic.message,
                    explanation: diagnostic.explanation,
                    action: diagnostic.action,
                    count: diagnostic.count,
                };

                if (options.verbose) {
                    entry.items = diagnostic.items;
                }

                return entry;
            }),
            integrity: {
                summary: integrity.summary,
                diagnostics: integrity.diagnostics,
            },
        };

        if (options.note) {
            json.integrity.filter = {
                note: options.note,
                matched: integrity.filterMatched,
            };
        }

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

    printDiagnostics(diagnostics, options);

    console.log(`\n${c.heading("Health Score")}\n`);
    console.log(`  Score         : ${c.value(`${result.score}/100`)}`);
    console.log(`  Rating        : ${c.value(result.rating)}`);

    printIntegritySummary(integrity, options);

    if (options.verbose) {
        printIntegrityDetails(integrity);
    }

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
