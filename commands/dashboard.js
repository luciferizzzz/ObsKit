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

    console.log(`${c.heading("📝 Vault Statistics")}\n`);
    console.log(`  Total Notes     : ${c.value(data.noteCount)}`);
    console.log(`  People          : ${c.value(data.peopleCount)}`);
    console.log(`  Projects        : ${c.value(data.projectsCount)}`);
    console.log(`  Attachments     : ${c.value(data.attachmentCount)}`);
    console.log(`  Markdown Files  : ${c.value(data.noteCount)}`);

    console.log(`\n${c.heading("🔗 Knowledge Statistics")}\n`);
    console.log(`  Backlinks       : ${c.value(data.totalBacklinks)}`);
    console.log(`  Orphan Notes    : ${c.value(data.orphanCount)}`);
    console.log(`  Relationships   : ${c.value(data.relationshipsCount)}`);
    console.log(`  Tags            : ${c.value(data.tags.length)}`);
    console.log(`  Related Notes   : ${c.value(data.relatedNotesCount)}`);
    console.log(`  Wiki Links      : ${c.value(data.totalLinks)}`);

    console.log(`\n${c.heading("📋 Productivity Statistics")}\n`);
    const totalTasks = data.pendingTasks + data.completedTasks;
    console.log(`  Today's Tasks   : ${c.value(totalTasks)}`);
    console.log(`  Completed       : ${c.value(data.completedTasks)}`);
    console.log(`  Pending         : ${c.value(data.pendingTasks)}`);

    if (data.recentDailyNotes.length > 0) {
        console.log(`\n  ${c.heading("Recent Daily Notes")}`);
        data.recentDailyNotes.forEach((entry) => {
            console.log(`    ${c.note(entry.name)} ${c.dim(`(${formatDate(entry.mtime)})`)}`);
        });
    }

    console.log(`\n${c.heading("📝 Notes Modified Today")}\n`);

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

    console.log(`\n${c.heading("📈 Activity (Last 7 Days)")}\n`);

    const days = Object.entries(data.activity);
    const maxCount = Math.max(
        ...days.map(([, count]) => count),
        1
    );

    for (const [key, count] of days) {
        const [, month, day] = key.split("-");
        const bar = "█".repeat(
            Math.max(1, Math.round((count / maxCount) * 10))
        );
        const label = `${month}-${day}`;

        console.log(`  ${c.dim(label)}  ${c.value(count.toString().padStart(2))}  ${c.value(bar)}`);
    }

    console.log(`\n${c.heading("🕒 Recent Notes")}\n`);

    const shown = data.recent.slice(0, 5);
    shown.forEach((entry, index) => {
        console.log(`  ${index + 1}. ${c.note(entry.path)}`);
        console.log(`     ${c.dim(`${formatDate(entry.mtime)} ${formatTime(entry.mtime)}`)}`);
    });

    if (data.createdNotes.length > 0) {
        console.log(`\n${c.heading("🆕 Recently Created")}\n`);

        const createdShown = data.createdNotes.slice(0, 5);
        createdShown.forEach((entry, index) => {
            console.log(`  ${index + 1}. ${c.note(entry.path)}`);
            console.log(`     ${c.dim(`${formatDate(entry.ctime)} ${formatTime(entry.ctime)}`)}`);
        });
    }

    console.log(`\n${c.divider("────────────────────────")}`);
    console.log(`${c.dim(`Dashboard terakhir diperbarui: ${formatTime(now)}`)}`);
}

module.exports = dashboard;
