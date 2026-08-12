const { inspectAttachments, formatSize } = require("../checks/attachments");
const { info } = require("../utils/feedback");

function attachments() {
    const data = inspectAttachments();

    if (data.total === 0) {
        info("No attachments found in vault.");
        return;
    }

    console.log("\n📎 Attachment Inspector\n");
    console.log(`Total       : ${data.total}`);
    console.log(`Total Size  : ${formatSize(data.totalSize)}`);
    console.log(`Unreferenced: ${data.unreferencedCount}`);

    console.log("\nBy Type\n");

    data.byExtension.forEach(([ext, info], i) => {
        const name = ext || "(none)";
        console.log(
            `  ${i + 1}. ${name.padEnd(8)} ${String(info.count).padStart(4)} files   ${formatSize(info.size)}`
        );
    });

    if (data.unreferencedCount > 0) {
        console.log("\nUnreferenced Attachments\n");

        data.unreferenced
            .sort((a, b) => b.size - a.size)
            .slice(0, 15)
            .forEach((att) => {
                console.log(
                    `  ${att.relPath.padEnd(50)} ${formatSize(att.size)}`
                );
            });

        if (data.unreferencedCount > 15) {
            console.log(`  ... dan ${data.unreferencedCount - 15} lainnya`);
        }
    }
}

module.exports = attachments;
