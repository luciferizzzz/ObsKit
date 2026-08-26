const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { parseHeadings, parseWikiLinks } = require("../utils/relationship/parser");
const { findNoteFile, scanRelatedLinks, scanIncomingLinks } = require("../utils/relationship/scanner");
const { normalizeNoteRef } = require("../utils/relationship/validator");
const { error } = require("../utils/feedback");
const c = require("../utils/colors");

function countWords(content) {
    let cleaned = content;
    cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
    cleaned = cleaned.replace(/`[^`\n]+`/g, "");
    cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
    cleaned = cleaned.replace(/\[[^\]]+\]\([^)]+\)/g, "");
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, "");
    cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, "");
    cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, "");
    cleaned = cleaned.replace(/^\s*>/gm, "");
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1");
    cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1");
    cleaned = cleaned.replace(/__([^_]+)__/g, "$1");
    cleaned = cleaned.replace(/_([^_]+)_/g, "$1");
    cleaned = cleaned.replace(/~~([^~]+)~~/g, "$1");
    cleaned = cleaned.replace(/^\s*[-=]{3,}\s*$/gm, "");
    cleaned = cleaned.replace(/^\s*\|.*\|/gm, "");

    const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
    return words.length;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function buildHeadingTree(headings) {
    const root = { children: [] };
    const stack = [root];

    for (const h of headings) {
        const node = { text: h.text, level: h.level, children: [] };

        while (stack.length > 1 && stack[stack.length - 1].level >= h.level) {
            stack.pop();
        }

        stack[stack.length - 1].children.push(node);
        stack.push(node);
    }

    markLastChildren(root.children);
    return root.children;
}

function markLastChildren(nodes) {
    for (let i = 0; i < nodes.length; i++) {
        nodes[i].last = i === nodes.length - 1;
        markLastChildren(nodes[i].children);
    }
}

function renderHeadingTree(nodes, prefix = "") {
    const lines = [];

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const connector = node.last ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
        lines.push(`${prefix}${connector}${node.text}`);

        if (node.children && node.children.length > 0) {
            const childPrefix = prefix + (node.last ? "    " : "\u2502   ");
            lines.push(...renderHeadingTree(node.children, childPrefix));
        }
    }

    return lines;
}

function info(note) {
    const vault = getVaultPath();
    const files = scanMarkdownFiles(vault);
    const noteFile = findNoteFile(files, note);

    if (!noteFile) {
        error(`Note not found: ${note}`);
        return;
    }

    const noteName = path.basename(noteFile, ".md");
    const relativePath = path.relative(vault, noteFile).split(path.sep).join("/");
    const stat = fs.statSync(noteFile);
    const content = fs.readFileSync(noteFile, "utf8");
    const headings = parseHeadings(content);
    const outgoingLinks = parseWikiLinks(content);
    const tags = extractTags(content);
    const wordCount = countWords(content);
    const related = scanRelatedLinks(files, noteName);

    const incoming = scanIncomingLinks(files);
    const backlinks = (incoming[normalizeNoteRef(noteName)] || []).map((b) => b.source);

    console.log(`\n${c.heading("Note Information")}\n`);
    console.log(`${c.title("Name")}       : ${c.value(noteName)}`);
    console.log(`${c.title("Path")}       : ${c.path(relativePath)}`);
    console.log(`${c.title("Size")}       : ${c.value(formatFileSize(stat.size))}`);
    console.log(`${c.title("Words")}      : ${c.value(wordCount.toLocaleString())}`);
    console.log(`${c.title("Created")}    : ${c.value(formatDate(stat.birthtime))}`);
    console.log(`${c.title("Modified")}   : ${c.value(formatDate(stat.mtime))}`);

    if (headings.length > 0) {
        console.log(`\n${c.heading("Headings")}\n`);
        const tree = buildHeadingTree(headings);
        console.log(renderHeadingTree(tree).join("\n"));
    }

    console.log(`\n${c.heading("Links")}\n`);
    console.log(`${c.title("Outgoing")}   : ${c.value(outgoingLinks.length)}`);
    console.log(`${c.title("Backlinks")}  : ${c.value(backlinks.length)}`);
    console.log(`${c.title("Related")}    : ${c.value(related.length)}`);

    if (tags.length > 0) {
        console.log(`\n${c.heading("Tags")}\n`);
        for (const tag of tags) {
            console.log(c.tag(tag));
        }
    }

    console.log(`\n${c.divider("-----------------------")}`);
}

function extractTags(content) {
    let cleaned = content.replace(/```[\s\S]*?```/g, "");
    cleaned = cleaned.replace(/`[^`\n]+`/g, "");
    const regex = /(?:^|\s)#([a-zA-Z0-9_/][a-zA-Z0-9_\-/]*)/g;
    const tags = [];
    let match;
    while ((match = regex.exec(cleaned)) !== null) {
        tags.push("#" + match[1]);
    }
    return [...new Set(tags)];
}

module.exports = info;
