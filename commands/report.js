const fs = require("fs");
const path = require("path");

const collectVaultReport = require("../checks/vaultReport");
const { formatSize } = require("../checks/vaultReport");
const { info, success } = require("../utils/feedback");

function formatDate(date) {
    return (
        `${date.getFullYear()}-` +
        `${String(date.getMonth() + 1).padStart(2, "0")}-` +
        `${String(date.getDate()).padStart(2, "0")} ` +
        `${String(date.getHours()).padStart(2, "0")}:` +
        `${String(date.getMinutes()).padStart(2, "0")}`
    );
}

function toMarkdown(data) {
    const lines = [];

    lines.push("# Vault Report");
    lines.push("");
    lines.push(`**Vault:** ${data.vault}`);
    lines.push(`**Generated:** ${formatDate(new Date())}`);
    lines.push("");

    lines.push("## Overview");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|---|---|");
    lines.push(`| Notes | ${data.noteCount} |`);
    lines.push(`| Folders | ${data.folderCount} |`);
    lines.push(`| Total Size | ${formatSize(data.totalSize)} |`);
    lines.push(`| Total Words | ${data.totalWords} |`);
    lines.push("");

    lines.push("## Folder Distribution");
    lines.push("");
    lines.push("| Folder | Notes |");
    lines.push("|---|---|");
    for (const [folder, count] of data.folders) {
        lines.push(`| ${folder} | ${count} |`);
    }
    lines.push("");

    lines.push("## Graph & Links");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|---|---|");
    lines.push(`| Wiki Links | ${data.totalLinks} |`);
    lines.push(`| Average Links | ${data.avgLinks} per note |`);
    lines.push(`| Broken Links | ${data.brokenCount} |`);
    lines.push(`| Orphan Notes | ${data.orphanCount} |`);
    lines.push("");

    if (data.mostLinked.length > 0) {
        lines.push("### Most Linked Notes");
        lines.push("");
        lines.push("| # | Note | Links |");
        lines.push("|---|---|---|");
        data.mostLinked.forEach(([note, count], i) => {
            lines.push(`| ${i + 1} | ${note} | ${count} |`);
        });
        lines.push("");
    }

    if (data.tags.length > 0) {
        lines.push("## Tags");
        lines.push("");
        lines.push("| Tag | Count |");
        lines.push("|---|---|");
        data.tags.slice(0, 20).forEach(([tag, count]) => {
            lines.push(`| ${tag} | ${count} |`);
        });
        lines.push("");
    }

    lines.push("## Attachments");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|---|---|");
    lines.push(`| Files | ${data.attachmentCount} |`);
    lines.push(`| Total Size | ${formatSize(data.attachmentSize)} |`);
    lines.push("");

    lines.push("## Recent Activity");
    lines.push("");
    lines.push("| # | Path | Modified |");
    lines.push("|---|---|---|");
    data.recent.slice(0, 20).forEach((entry, index) => {
        lines.push(`| ${index + 1} | ${entry.path} | ${formatDate(entry.mtime)} |`);
    });
    lines.push("");

    if (data.brokenCount > 0) {
        lines.push("## Broken Links");
        lines.push("");
        lines.push("| File | Link |");
        lines.push("|---|---|");
        data.broken.slice(0, 20).forEach(({ file, link }) => {
            const rel = path.relative(data.vault, file).split(path.sep).join("/");
            lines.push(`| ${rel} | [[${link}]] |`);
        });
        if (data.brokenCount > 20) {
            lines.push(`| ... | ${data.brokenCount - 20} more |`);
        }
        lines.push("");
    }

    lines.push("---");
    lines.push(
        `Total Note: ${data.noteCount} | Words: ${data.totalWords} | Broken Links: ${data.brokenCount}`
    );

    return lines.join("\n");
}

function toJSON(data) {
    return JSON.stringify(data, null, 2);
}

function toHTML(data) {
    const md = toMarkdown(data);

    const html = [
        "<!DOCTYPE html>",
        "<html lang=\"en\">",
        "<head>",
        "<meta charset=\"UTF-8\">",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">",
        "<title>Vault Report - ObsKit</title>",
        "<style>",
        "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; background: #0d1117; color: #c9d1d9; line-height: 1.6; }",
        "h1 { color: #58a6ff; border-bottom: 2px solid #21262d; padding-bottom: 10px; }",
        "h2 { color: #7d8b99; margin-top: 30px; border-bottom: 1px solid #21262d; padding-bottom: 5px; }",
        "h3 { color: #a3acb9; }",
        "table { border-collapse: collapse; width: 100%; margin: 15px 0; }",
        "th, td { border: 1px solid #21262d; padding: 8px 12px; text-align: left; }",
        "th { background: #161b22; color: #58a6ff; }",
        "tr:nth-child(even) { background: #161b22; }",
        "code { background: #21262d; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }",
        ".footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #21262d; color: #6e7681; font-size: 0.9em; }",
        "</style>",
        "</head>",
        "<body>",
        mdToHtml(md),
        "</body>",
        "</html>",
        "",
    ].join("\n");

    return html;
}

function mdToHtml(md) {
    let html = md;

    // Headers
    html = html.replace(/^### (.*$)/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.*$)/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.*$)/gm, "<h1>$1</h1>");

    // Tables
    const lines = html.split("\n");
    const output = [];
    let inTable = false;
    let tableRows = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.match(/^\|/) && line.includes("|")) {
            if (!inTable) {
                inTable = true;
                tableRows = [];
            }
            tableRows.push(line);

            // Check if next line is a separator
            if (lines[i + 1] && lines[i + 1].match(/^\|[-:\s]+\|/)) {
                // It's a separator, continue collecting rows
                continue;
            }
        } else {
            if (inTable) {
                if (tableRows.length >= 2 && tableRows[1].match(/^\|[-:\s]+\|/)) {
                    output.push(renderTable(tableRows));
                }
                tableRows = [];
                inTable = false;
            }
            output.push(line);
        }
    }

    if (inTable && tableRows.length >= 2 && tableRows[1].match(/^\|[-:\s]+\|/)) {
        output.push(renderTable(tableRows));
    }

    html = output.join("\n");

    // Code (inline already handled by table rendering)
    html = html.replace(/^---$/gm, '<div class="footer">');

    // Wrap final footer
    html = html.replace(
        /<div class="footer">(.*)$/s,
        '<div class="footer">$1</div>'
    );

    return html;
}

function renderTable(rows) {
    const html = [];
    html.push("<table>");

    // Header
    const headerCells = rows[0].split("|").slice(1, -1);
    html.push("<thead><tr>");
    headerCells.forEach((cell) => {
        html.push(`<th>${cell.trim()}</th>`);
    });
    html.push("</tr></thead>");

    // Body
    html.push("<tbody>");
    for (let i = 2; i < rows.length; i++) {
        const cells = rows[i].split("|").slice(1, -1);
        html.push("<tr>");
        cells.forEach((cell) => {
            html.push(`<td>${cell.trim()}</td>`);
        });
        html.push("</tr>");
    }
    html.push("</tbody>");
    html.push("</table>");

    return html.join("");
}

function report(options = {}) {
    const data = collectVaultReport();

    if (data.noteCount === 0) {
        info("Vault kosong. Tidak ada note ditemukan.");
        return;
    }

    const exportFormats = [];
    if (options.markdown) exportFormats.push("markdown");
    if (options.html) exportFormats.push("html");
    if (options.json) exportFormats.push("json");

    if (exportFormats.length === 0) {
        printConsole(data);
        return;
    }

    const vault = data.vault;
    const baseName = "vault-report";
    const timestamp = formatDate(new Date()).replace(/[-: ]/g, "");

    const outputDir = options.output
        ? path.dirname(options.output)
        : path.join(vault, "_exports");
    fs.mkdirSync(outputDir, { recursive: true });

    const results = [];

    for (const fmt of exportFormats) {
        let content;
        let ext;
        let filename;

        if (options.output && exportFormats.length === 1) {
            filename = options.output;
        } else {
            filename = `${baseName}-${timestamp}.${fmt}`;
        }

        const filepath = path.isAbsolute(filename)
            ? filename
            : path.join(outputDir, filename);

        switch (fmt) {
            case "markdown":
                content = toMarkdown(data);
                ext = ".md";
                break;
            case "html":
                content = toHTML(data);
                ext = ".html";
                break;
            case "json":
                content = toJSON(data);
                ext = ".json";
                break;
        }

        fs.writeFileSync(filepath, content, "utf8");
        results.push(filepath);
    }

    console.log("\n");
    success("Report exported:");
    console.log("\n");
    results.forEach((filepath) => {
        console.log(`  ${filepath}`);
    });
}

function printConsole(data) {
    console.log("\n📋 Vault Report\n");
    console.log(`📍 ${data.vault}\n`);

    console.log("Overview\n");

    console.log(`Notes          : ${data.noteCount}`);
    console.log(`Folders        : ${data.folderCount}`);
    console.log(`Total Size     : ${formatSize(data.totalSize)}`);
    console.log(`Total Words    : ${data.totalWords}`);

    console.log("\nFolder Distribution\n");

    for (const [folder, count] of data.folders) {
        console.log(`  ${folder.padEnd(15)} ${count} notes`);
    }

    console.log("\nGraph & Links\n");

    console.log(`Wiki Links     : ${data.totalLinks}`);
    console.log(`Average Links  : ${data.avgLinks} per note`);
    console.log(`Broken Links   : ${data.brokenCount}`);
    console.log(`Orphan Notes   : ${data.orphanCount}`);

    if (data.mostLinked.length > 0) {
        console.log("\nMost Linked Notes\n");

        data.mostLinked.forEach(([note, count], i) => {
            console.log(`  ${i + 1}. ${note} (${count})`);
        });
    }

    if (data.tags.length > 0) {
        console.log("\nTags\n");

        data.tags.slice(0, 10).forEach(([tag, count]) => {
            console.log(`  ${tag} (${count})`);
        });
    }

    console.log("\nAttachments\n");

    console.log(`Files          : ${data.attachmentCount}`);
    console.log(`Total Size     : ${formatSize(data.attachmentSize)}`);

    console.log("\nRecent Activity\n");

    data.recent.slice(0, 10).forEach((entry, index) => {
        console.log(`  ${index + 1}. ${entry.path}`);
        console.log(`     ${formatDate(entry.mtime)}`);
    });

    if (data.brokenCount > 0) {
        console.log("\nBroken Links\n");

        data.broken.slice(0, 10).forEach(({ file, link }) => {
            const rel = path.relative(data.vault, file).split(path.sep).join("/");
            console.log(`  ${rel} → [[${link}]]`);
        });

        if (data.brokenCount > 10) {
            console.log(`  ... dan ${data.brokenCount - 10} lainnya`);
        }
    }

    console.log("\n────────────────────────");
    console.log(`Total Note: ${data.noteCount} | Words: ${data.totalWords} | Broken Links: ${data.brokenCount}`);
}

module.exports = report;