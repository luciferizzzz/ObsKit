const { input } = require("@inquirer/prompts");
const { saveConfig } = require("../utils/config");
const { error, success } = require("../utils/feedback");

async function init() {
    const vault = (await input({
        message: "Lokasi Obsidian Vault",
    })).trim();

    if (!vault) {
        error("Path tidak boleh kosong.");
        return;
    }

    saveConfig({ vault });

    success("Vault berhasil disimpan.")
}

module.exports = init;