const path = require("path");
const fs = require("fs");

const { parseTemplate, getTemplateData } = require("../utils/markdown");
const { createFile } = require("../utils/file");
const { getVaultPath } = require("../utils/vault");
const { sanitizeFilename, mdFileName } = require("../utils/sanitizeFilename");
const { error, success } = require("../utils/feedback");
const c = require("../utils/colors");

function newNote(folder, title, options) {
    const vault = getVaultPath();
    title = sanitizeFilename(title);

    let content = "";

    if (options.template) {
        const templatePath = path.join(
            __dirname,
            "..",
            "templates",
            `${options.template}.md`
        );

        if (!fs.existsSync(templatePath)) {
            error("Template tidak ditemukan.");
            return;
        }

        content = fs.readFileSync(templatePath, "utf8");

        content = parseTemplate(content, getTemplateData({ title, folder }));
    }

    const filePath = path.join(
        vault,
        folder,
        mdFileName(title)
    );

    try {
        createFile(filePath, content);

        success("Note berhasil dibuat!");
        console.log(c.path(filePath));
    } catch (err) {
        error(err.message);
    }
}

module.exports = newNote;