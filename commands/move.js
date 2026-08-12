const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { mdFileName } = require("../utils/sanitizeFilename");
const { error, success } = require("../utils/feedback");

function move(sourceFolder, title, targetFolder) {
    const vault = getVaultPath();

    const rawSource = path.join(
        vault,
        sourceFolder,
        `${title}.md`
    );

    const source = fs.existsSync(rawSource)
        ? rawSource
        : path.join(vault, sourceFolder, mdFileName(title));

    const destination = path.join(
        vault,
        targetFolder,
        mdFileName(title)
    );

    if (!fs.existsSync(source)) {
        error(`Note not found: ${title}`);
        return;
    }

    fs.renameSync(source, destination);

    success("Note berhasil dipindahkan.");
    console.log(`${sourceFolder} → ${targetFolder}`);
}

module.exports = move;