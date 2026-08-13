const fs = require("fs");
const path = require("path");

const { error } = require("../utils/feedback");
const c = require("../utils/colors");

function templateList() {
    const templateDir = path.join(__dirname, "..", "templates");
    const files = fs.readdirSync(templateDir);

    console.log(`\n${c.heading("📄 Available Templates")}:\n`);

    const templateNames = [];
    for (const file of files) {
        if (file.endsWith(".md")) {
            const name = file.replace(".md", "");
            templateNames.push(name);
            console.log(`  ${c.note(name)}`);
        }
    }

    console.log("\n");

    return templateNames;
}

function templatePreview(name) {
    const templatePath = path.join(
        __dirname,
        "..",
        "templates",
        `${name}.md`
    );

    if (!fs.existsSync(templatePath)) {
        error("Template tidak ditemukan.");
        return null;
    }

    const content = fs.readFileSync(templatePath, "utf8");

    console.log("\n");
    console.log(`${c.heading(`📄 Preview: ${name}`)}\n`);
    console.log(content);
    console.log("\n");

    return content;
}

function templateAction(options) {
    if (options.list) {
        return templateList();
    }

    if (options.preview) {
        return templatePreview(options.preview);
    }

    console.log(`\n${c.dim("❓ Silakan gunakan --list atau --preview <nama_template>")}\n`);
}

module.exports = templateAction;
