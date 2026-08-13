const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const { getVaultPath } = require("../utils/vault");
const { error, success } = require("../utils/feedback");
const c = require("../utils/colors");

function open(keyword) {
    const vault = getVaultPath();
    const results = [];

    search(vault);

    function search(dir) {
        const files = fs.readdirSync(dir, {
            withFileTypes: true,
        });

        for (const file of files) {
            const fullPath = path.join(dir, file.name);

            if (file.isDirectory()) {
                search(fullPath);
            } else if (
                file.name.toLowerCase().includes(keyword.toLowerCase())
            ) {
                results.push(fullPath);
            }
        }
    }

    if (results.length === 0) {
        error("Note tidak ditemukan.");
        return;
    }

    if (results.length > 1) {
        console.log(c.title("Ditemukan beberapa note:"));

        results.forEach((file, index) => {
            console.log(`${index + 1}. ${c.note(path.relative(vault, file))}`);
        });

        return;
    }

    exec(`start "" "${results[0]}"`);

    success("Membuka note...");
}

module.exports = open;