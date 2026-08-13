const fs = require("fs");
const path = require("path");

const collectVaultReport = require("../checks/vaultReport");
const { getVaultPath } = require("../utils/vault");
const { info } = require("../utils/feedback");
const c = require("../utils/colors");

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

    console.log(`\n${c.heading("📊 Dashboard")}\n`);
    console.log(`🗓  ${now.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    })}`);
    console.log(`📂 ${c.path(vault)}\n`);

    // Today's activity
    console.log(`${c.heading("📝 Notes Modified Today")}\n`);

    if (data.notesToday.length === 0) {
        console.log(c.dim("  Belum ada note yang dimodifikasi hari ini."));
    } else {
        data.notesToday
            .map((file) => ({
                path: path.relative(vault, file).split(path.sep).join("/"),
                mtime: fs.statSync(file).mtime,
            }))
            .sort((a, b) => b.mtime - a.mtime)
            .forEach((entry) => {
                console.log(`  • ${c.note(entry.path)} ${c.dim(`(${formatTime(entry.mtime)})`)}`);
            });
    }

    // Last 7 days activity
    const days = Object.entries(data.activity);
    const maxCount = Math.max(
        ...days.map(([, count]) => count),
        1
    );

    console.log(`\n${c.heading("📈 Last 7 Days")}\n`);

    for (const [key, count] of days) {
        const [, month, day] = key.split("-");
        const bar = "█".repeat(
            Math.max(1, Math.round((count / maxCount) * 10))
        );
        const label = `${month}-${day}`;

        console.log(`  ${c.dim(label)}  ${c.value(count.toString().padStart(2))}  ${c.value(bar)}`);
    }

    // Key metrics
    console.log(`\n${c.heading("⚡ Key Metrics")}\n`);

    console.log(`  Notes       : ${c.value(data.noteCount)}`);
    console.log(`  Folders     : ${c.value(data.folderCount)}`);
    console.log(`  Wiki Links  : ${c.value(data.totalLinks)}`);
    console.log(`  Broken Links: ${c.value(data.brokenCount)}`);
    console.log(`  Orphans     : ${c.value(data.orphanCount)}`);
    console.log(`  Tags        : ${c.value(data.tags.length)}`);

    // Recent notes
    const shown = data.recent.slice(0, 5);

    console.log(`\n${c.heading("🕒 Recent Notes")}\n`);

    shown.forEach((entry, index) => {
        console.log(`  ${index + 1}. ${c.note(entry.path)}`);
        console.log(`     ${c.dim(`${formatDate(entry.mtime)} ${formatTime(entry.mtime)}`)}`);
    });

    console.log(`\n${c.divider("────────────────────────")}`);
    console.log(`${c.dim(`Dashboard terakhir diperbarui: ${formatTime(now)}`)}`);
}

module.exports = dashboard;
