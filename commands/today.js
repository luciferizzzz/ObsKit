const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { createFile } = require("../utils/file");
const { parseTemplate, getTemplateData } = require("../utils/markdown");
const { warning, success } = require("../utils/feedback");

function today() {
    const vault = getVaultPath();

    const now = new Date();

    const date =
        `${now.getFullYear()}-` +
        `${String(now.getMonth() + 1).padStart(2, "0")}-` +
        `${String(now.getDate()).padStart(2, "0")}`;

    const filePath = path.join(
        vault,
        "Daily Notes",
        `${date}.md`
    );

    console.log("Tanggal :", date);
    console.log("Path :", filePath);
    console.log("Exists :", fs.existsSync(filePath));

    if (fs.existsSync(filePath)) {
        warning("Daily note hari ini sudah ada.");
        return;
    }

    const templatePath = path.join(
        __dirname,
        "..",
        "templates",
        "daily.md"
    );

    let content = "";

    if (fs.existsSync(templatePath)) {
        content = fs.readFileSync(templatePath, "utf8");

        content = parseTemplate(content, getTemplateData({
            title: date,
            folder: "Daily Notes",
            date,
        }));
    }
    createFile(filePath, content);
    success("Daily note berhasil dibuat!");
}

module.exports = today;
