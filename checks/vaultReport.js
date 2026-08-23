const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { buildNoteIndex, buildNormalizedNoteIndex } = require("../utils/noteIndex");
const { extractWikiLinks } = require("../utils/wikilinks");
const { listPeople } = require("../utils/people");
const { getSectionContent } = require("../utils/relationship/parser");

function stripCodeBlocks(content) {
    let result = content.replace(/```[\s\S]*?```/g, "");
    result = result.replace(/`[^`\n]+`/g, "");
    return result;
}

function extractTags(cleaned) {
    const regex = /(?:^|\s)#([a-zA-Z0-9_/][a-zA-Z0-9_\-/]*)/g;
    const tags = [];
    let match;

    while ((match = regex.exec(cleaned)) !== null) {
        tags.push("#" + match[1]);
    }

    return tags;
}

function extractChecklists(content) {
    const lines = content.split(/\r?\n/);
    const pending = [];
    const completed = [];

    for (const line of lines) {
        const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
        if (!match) continue;
        const done = match[1].toLowerCase() === "x";
        const text = match[2].trim();
        if (done) {
            completed.push(text);
        } else {
            pending.push(text);
        }
    }

    return { pending, completed };
}

function scanAttachments(root) {
    const attachments = [];

    function scan(dir) {
        const entries = fs.readdirSync(dir, {
            withFileTypes: true,
        });

        for (const entry of entries) {
            if (entry.name.startsWith(".")) {
                continue;
            }

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                scan(fullPath);
            } else if (!entry.name.endsWith(".md")) {
                attachments.push(fullPath);
            }
        }
    }

    if (fs.existsSync(root)) {
        scan(root);
    }

    return attachments;
}

function countDirectoryMarkdownFiles(dir) {
    if (!fs.existsSync(dir)) return 0;

    let count = 0;

    function scan(d) {
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(d, entry.name);
            if (entry.isDirectory()) {
                scan(fullPath);
            } else if (entry.name.endsWith(".md")) {
                count++;
            }
        }
    }

    scan(dir);
    return count;
}

function formatSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dateKey(date) {
    return (
        `${date.getFullYear()}-` +
        `${String(date.getMonth() + 1).padStart(2, "0")}-` +
        `${String(date.getDate()).padStart(2, "0")}`
    );
}

function collectVaultReport() {
    const vault = getVaultPath();

    const files = scanMarkdownFiles(vault);
    const noteNames = buildNoteIndex(files);
    const normalizedNotes = buildNormalizedNoteIndex(files);

    let totalWords = 0;
    let totalSize = 0;
    let totalLinks = 0;

    const broken = [];
    const tagCount = {};
    const folderCount = {};
    const incoming = {};
    const outgoing = {};
    const notesToday = [];
    const createdToday = [];
    const activity = {};
    const fileEntries = [];
    const relatedTargets = new Set();

    const todayKey = dateKey(new Date());

    let totalPending = 0;
    let totalCompleted = 0;
    let totalRelationships = 0;

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        activity[dateKey(d)] = 0;
    }

    for (const file of files) {
        const content = fs.readFileSync(file, "utf8");
        const stat = fs.statSync(file);

        totalSize += stat.size;

        const cleaned = stripCodeBlocks(content);
        const words = cleaned
            .replace(/[#*_>`[\]]/g, " ")
            .split(/\s+/)
            .filter(Boolean);
        totalWords += words.length;

        const mtimeKey = dateKey(stat.mtime);
        const ctimeKey = dateKey(stat.ctime);

        if (mtimeKey === todayKey) {
            notesToday.push(file);
        }

        if (ctimeKey === todayKey) {
            createdToday.push(file);
        }

        if (activity[mtimeKey] !== undefined) {
            activity[mtimeKey]++;
        }

        const noteName = path.basename(file, ".md");
        const links = extractWikiLinks(content);

        totalLinks += links.length;
        outgoing[noteName] = links.length;

        for (const link of links) {
            const clean = link.split("#")[0].trim().toLowerCase();

            if (normalizedNotes.has(clean)) {
                if (!incoming[clean]) {
                    incoming[clean] = 0;
                }
                incoming[clean]++;
            } else {
                broken.push({ file, link });
            }
        }

        const relatedSection = getSectionContent(content, "Related");
        if (relatedSection) {
            const relatedLinks = extractWikiLinks(relatedSection);
            totalRelationships += relatedLinks.length;

            for (const link of relatedLinks) {
                relatedTargets.add(link.split("#")[0].trim().toLowerCase());
            }
        }

        const checklists = extractChecklists(content);
        totalPending += checklists.pending.length;
        totalCompleted += checklists.completed.length;

        for (const tag of extractTags(cleaned)) {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
        }

        const folder = path.relative(vault, path.dirname(file));
        const folderName = folder.split(path.sep)[0] || "(root)";
        folderCount[folderName] = (folderCount[folderName] || 0) + 1;

        fileEntries.push({
            path: path.relative(vault, file).split(path.sep).join("/"),
            mtime: stat.mtime,
            ctime: stat.ctime,
        });
    }

    const orphans = [];

    for (const note of noteNames) {
        if (!incoming[note.toLowerCase()]) {
            orphans.push(note);
        }
    }

    let totalBacklinks = 0;
    for (const key of Object.keys(incoming)) {
        totalBacklinks += incoming[key];
    }

    const attachments = scanAttachments(vault);
    const attachmentSize = attachments.reduce(
        (sum, file) => {
            try {
                return sum + fs.statSync(file).size;
            } catch (_) {
                return sum;
            }
        },
        0
    );

    const recent = fileEntries
        .slice()
        .sort((a, b) => b.mtime - a.mtime)
        .map((entry) => ({ path: entry.path, mtime: entry.mtime }));

    const createdNotes = fileEntries
        .slice()
        .sort((a, b) => b.ctime - a.ctime)
        .map((entry) => ({ path: entry.path, ctime: entry.ctime }));

    const peopleCount = listPeople(vault).length;

    const projectsDir = path.join(vault, "Projects");
    const projectsCount = countDirectoryMarkdownFiles(projectsDir);

    const dailyDir = path.join(vault, "Daily Notes");
    let recentDailyNotes = [];

    if (fs.existsSync(dailyDir)) {
        recentDailyNotes = fs
            .readdirSync(dailyDir)
            .filter((f) => f.endsWith(".md"))
            .map((f) => ({
                name: f.replace(/\.md$/i, ""),
                mtime: fs.statSync(path.join(dailyDir, f)).mtime,
            }))
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, 5);
    }

    const mostLinked = Object.entries(outgoing)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const tags = Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1]);

    const folders = Object.entries(folderCount)
        .sort((a, b) => b[1] - a[1]);

    return {
        vault,
        noteCount: files.length,
        folderCount: folders.length,
        totalSize,
        totalWords,
        totalLinks,
        totalBacklinks,
        brokenCount: broken.length,
        broken,
        orphanCount: orphans.length,
        orphans,
        notesToday,
        createdToday,
        activity,
        recent,
        createdNotes,
        mostLinked,
        tags,
        folders,
        attachmentCount: attachments.length,
        attachmentSize,
        peopleCount,
        projectsCount,
        relationshipsCount: totalRelationships,
        relatedNotesCount: relatedTargets.size,
        pendingTasks: totalPending,
        completedTasks: totalCompleted,
        recentDailyNotes,
        avgLinks: files.length > 0
            ? (totalLinks / files.length).toFixed(2)
            : "0.00",
    };
}

module.exports = collectVaultReport;

module.exports.formatSize = formatSize;
