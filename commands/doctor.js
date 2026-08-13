const checkDeadLinks = require("../checks/deadlinks");
const c = require("../utils/colors");
const { success, warning } = require("../utils/feedback");

function doctor() {
    const dead = checkDeadLinks();

    console.log(`\n${c.heading(" Vault Health Report")}\n`);

    console.log(`Notes : ${c.value(dead.files.length)}`);
    console.log(`Links : ${c.value(dead.totalLinks)}`);
    console.log(`Broken Links : ${c.value(dead.broken.length)}`);

    if (dead.broken.length === 0) {
        success("Vault Healthy");
    } else {
        warning("Ada masalah yang perlu diperbaiki.")
    }

}

module.exports = doctor