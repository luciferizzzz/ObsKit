const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { error } = require("../utils/feedback");
const c = require("../utils/colors");

// Folders to ignore (hidden and build directories)
const IGNORED = [".obsidian", ".git", "node_modules"];

// Unicode tree-drawing characters
const TREE = {
    BRANCH: "├── ",
    LAST: "└── ",
    PIPE: "│   ",
    SPACE: "    ",
};

function tree() {
    const vault = getVaultPath();
    let totalFolders = 0;
    let totalNotes = 0;

    if (!fs.existsSync(vault)) {
        error("Vault tidak ditemukan.");
        return;
    }

    console.log(`\n${c.heading("🌳 Vault Tree")}\n`);
    console.log(c.path(path.basename(vault)));

    printTree(vault, "");

    console.log(`\n${c.divider("────────────────────────")}`);
    console.log(`${c.title("Folders")} : ${c.value(totalFolders)}`);
    console.log(`${c.title("Notes")}   : ${c.value(totalNotes)}`);

    /**
     * Recursively reads a directory and prints its contents as a tree.
     *
     * Algorithm:
     * 1. Read all entries using readdirSync with withFileTypes option.
     * 2. Filter out ignored folders and non-.md files.
     * 3. Separate into folders and files, sort alphabetically.
     * 4. Render each entry with proper Unicode tree connectors.
     * 5. Recurse into subdirectories with an updated prefix.
     *
     * @param {string} dir - The directory to scan
     * @param {string} prefix - The indentation prefix for tree lines
     */
    function printTree(dir, prefix) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        // Keep only non-ignored directories and .md files
        const filtered = entries.filter((entry) => {
            if (entry.isDirectory()) {
                return !IGNORED.includes(entry.name);
            }
            return entry.name.endsWith(".md");
        });

        // Sort folders and files alphabetically (case-insensitive)
        const folders = filtered
            .filter((e) => e.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

        const files = filtered
            .filter((e) => e.isFile())
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

        // Folders first, then files
        const combined = [...folders, ...files];

        combined.forEach((entry, index) => {
            const isLast = index === combined.length - 1;
            const connector = isLast ? TREE.LAST : TREE.BRANCH;
            const nextPrefix = isLast ? TREE.SPACE : TREE.PIPE;

            console.log(`${prefix}${connector}${entry.isDirectory() ? c.folder(entry.name) : c.note(entry.name)}`);

            if (entry.isDirectory()) {
                totalFolders++;
                // Recurse into the subdirectory with the updated prefix
                printTree(path.join(dir, entry.name), prefix + nextPrefix);
            } else {
                totalNotes++;
            }
        });
    }
}

module.exports = tree;
