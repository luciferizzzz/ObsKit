const { inspectAttachments, formatSize } = require("../checks/attachments");
const { info } = require("../utils/feedback");
const c = require("../utils/colors");

function attachments() {
    const data = inspectAttachments();

    if (data.total === 0) {
        info("No attachments found in vault.");
        return;
    }

    console.log(`\n${c.heading("📎 Attachment Inspector")}\n`);
    console.log(`${c.title("Total")}       : ${c.value(data.total)}`);
    console.log(`${c.title("Total Size")}  : ${c.value(formatSize(data.totalSize))}`);
    console.log(`${c.title("Unreferenced")}: ${c.value(data.unreferencedCount)}`);

    console.log(`\n${c.heading("By Type")}\n`);

    data.byExtension.forEach(([ext, info], i) => {
        const name = ext || "(none)";
        console.log(
            `  ${i + 1}. ${c.note(name.padEnd(8))} ${c.value(String(info.count).padStart(4))} files   ${c.dim(formatSize(info.size))}`
        );
    });

    if (data.unreferencedCount > 0) {
        console.log(`\n${c.heading("Unreferenced Attachments")}\n`);

        data.unreferenced
            .sort((a, b) => b.size - a.size)
            .slice(0, 15)
            .forEach((att) => {
                console.log(
                    `  ${c.path(att.relPath.padEnd(50))} ${c.dim(formatSize(att.size))}`
                );
            });

        if (data.unreferencedCount > 15) {
            console.log(`  ${c.dim(`... dan ${data.unreferencedCount - 15} lainnya`)}`);
        }
    }
}

module.exports = attachments;
