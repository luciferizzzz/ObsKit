const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { input, confirm } = require("@inquirer/prompts");
const { createProgress } = require("../utils/progress");
const c = require("../utils/colors");

function formatDate(date) {
    return (
        `${date.getFullYear()}` +
        `${String(date.getMonth() + 1).padStart(2, "0")}` +
        `${String(date.getDate()).padStart(2, "0")}_` +
        `${String(date.getHours()).padStart(2, "0")}` +
        `${String(date.getMinutes()).padStart(2, "0")}`
    );
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

function copyDir(src, dest, onFile) {
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath, onFile);
        } else {
            fs.copyFileSync(srcPath, destPath);
            if (onFile) onFile(destPath);
        }
    }
}

async function backup() {
    const vault = getVaultPath();

    console.log(`\n${c.heading("📦 Vault Backup")}\n`);
    console.log(`Source: ${c.path(vault)}`);

    const defaultBackupDir = path.join(path.dirname(vault), "vault-backups");

    if (!fs.existsSync(defaultBackupDir)) {
        fs.mkdirSync(defaultBackupDir, { recursive: true });
    }

    const backupDir = await input({
        message: "Backup destination folder:",
        default: defaultBackupDir,
    });

    const timestamp = formatDate(new Date());
    const vaultName = path.basename(vault);
    const backupName = `${vaultName}-${timestamp}`;
    const backupPath = path.join(backupDir, backupName);

    console.log(`\nDestination: ${c.path(backupPath)}`);

    const proceed = await confirm({
        message: "Start backup?",
        default: true,
    });

    if (!proceed) {
        console.log(c.dim("Backup cancelled."));
        return;
    }

    const totalFiles = getFileCount(vault);
    const progress = createProgress({ total: totalFiles });
    let copied = 0;

    const startTime = Date.now();
    copyDir(vault, backupPath, (destPath) => {
        copied++;
        const rel = path.relative(backupPath, destPath);
        progress.setText(rel);
        progress.tick();
    });
    progress.stop();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    const totalSize = getDirSize(backupPath);
    const fileCount = getFileCount(backupPath);

    console.log(`\n✅ Backup completed in ${duration}s`);
    console.log(`Files copied: ${c.value(fileCount)}`);
    console.log(`Total size: ${c.value(formatSize(totalSize))}`);
    console.log(`Location: ${c.path(backupPath)}`);
}

function getDirSize(dir) {
    let size = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            size += getDirSize(fullPath);
        } else {
            size += fs.statSync(fullPath).size;
        }
    }

    return size;
}

function getFileCount(dir) {
    let count = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isDirectory()) {
            count += getFileCount(path.join(dir, entry.name));
        } else {
            count++;
        }
    }

    return count;
}

module.exports = backup;
