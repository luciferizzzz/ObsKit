const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault")
const { mdFileName } = require("../utils/sanitizeFilename");
const { error, warning, success } = require("../utils/feedback");

function rename(folder, oldName, newName) {
    const vault = getVaultPath();

    const rawOldPath = path.join(
        vault,
        folder,
        `${oldName}.md`
    );

    const oldPath = fs.existsSync(rawOldPath)
        ? rawOldPath
        : path.join(vault, folder, mdFileName(oldName));

    const newPath = path.join(
        vault,
        folder,
        mdFileName(newName)
    );

    if (!fs.existsSync(oldPath)) {
        error(`Note not found: ${oldName}`);
        return;
    }

    if (fs.existsSync(newPath)) {
        warning(`Note already exists: ${newName}`);
        return;
    } 

    fs.renameSync(oldPath, newPath);

    success("Note berhasil diubah.");
    console.log(path.relative(vault, newPath));
}

module.exports = rename