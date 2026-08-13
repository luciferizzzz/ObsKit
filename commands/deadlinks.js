const path = require("path");

const checkDeadLinks = require("../checks/deadlinks");
const { success } = require("../utils/feedback");
const c = require("../utils/colors");

function deadlinks() {

    const result = checkDeadLinks();

    if (result.broken.length === 0) {
        success("Tidak ada broken links.");
        return;
    }

    const grouped = {};

    for (const item of result.broken) {

        if (!grouped[item.file]) {
            grouped[item.file] = [];
        }

        grouped[item.file].push(item.link);
    }

    console.log(`\n${c.heading("❌ Broken Links")}\n`);

    for (const file in grouped) {

        console.log(`📄 ${c.note(path.relative(result.vault, file))}`);

        grouped[file].forEach(link => {
            console.log(`   → ${c.dim(`[[${link}]]`)}`);
        });

        console.log();
    }

    console.log(c.divider("────────────────────────"));

    console.log(`${c.title("Notes Scanned")} : ${c.value(result.files.length)}`);
    console.log(`${c.title("Links Checked")} : ${c.value(result.totalLinks)}`);
    console.log(`${c.title("Broken Links")}  : ${c.value(result.broken.length)}`);
}

module.exports = deadlinks;