const fs = require("fs");
const path = require("path");

const collectVaultReport = require("../checks/vaultReport");
const { getVaultPath } = require("../utils/vault");
const { info } = require("../utils/feedback");

function formatDate(date) {
    return (
        `${date.getFullYear()}-` +
        `${String(date.getMonth() + 1).padStart(2, "0")}-` +
        `${String(date.getDate()).padStart(2, "0")}`
    );
}

function formatTime(date) {
    return (
        `${String(date.getHours()).padStart(2, "0")}:` +
        `${String(date.getMinutes()).padStart(2, "0")}`
    );
}

function dashboard() {
    const data = collectVaultReport();
    const vault = getVaultPath();

    if (data.noteCount === 0) {
        info("Vault kosong. Tidak ada note ditemukan.");
        return;
    }

    const now = new Date();

    console.log("\n📊 Dashboard\n");
    console.log(`🗓  ${now.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    })}`);
    console.log(`📂 ${vault}\n`);

    // Today's activity
    console.log("📝 Notes Modified Today\n");

    if (data.notesToday.length === 0) {
        console.log("  Belum ada note yang dimodifikasi hari ini.");
    } else {
        data.notesToday
            .map((file) => ({
                path: path.relative(vault, file).split(path.sep).join("/"),
                mtime: fs.statSync(file).mtime,
            }))
            .sort((a, b) => b.mtime - a.mtime)
            .forEach((entry) => {
                console.log(`  • ${entry.path} (${formatTime(entry.mtime)})`);
            });
    }

    // Last 7 days activity
    const days = Object.entries(data.activity);
    const maxCount = Math.max(
        ...days.map(([, count]) => count),
        1
    );

    console.log("\n📈 Last 7 Days\n");

    for (const [key, count] of days) {
        const [, month, day] = key.split("-");
        const bar = "█".repeat(
            Math.max(1, Math.round((count / maxCount) * 10))
        );
        const label = `${month}-${day}`;

        console.log(`  ${label}  ${count.toString().padStart(2)}  ${bar}`);
    }

    // Key metrics
    console.log("\n⚡ Key Metrics\n");

    console.log(`  Notes       : ${data.noteCount}`);
    console.log(`  Folders     : ${data.folderCount}`);
    console.log(`  Wiki Links  : ${data.totalLinks}`);
    console.log(`  Broken Links: ${data.brokenCount}`);
    console.log(`  Orphans     : ${data.orphanCount}`);
    console.log(`  Tags        : ${data.tags.length}`);

    // Recent notes
    const shown = data.recent.slice(0, 5);

    console.log("\n🕒 Recent Notes\n");

    shown.forEach((entry, index) => {
        console.log(`  ${index + 1}. ${entry.path}`);
        console.log(`     ${formatDate(entry.mtime)} ${formatTime(entry.mtime)}`);
    });

    console.log("\n────────────────────────");
    console.log(`Dashboard terakhir diperbarui: ${formatTime(now)}`);
}

module.exports = dashboard;
