const { getVaultPath } = require("../utils/vault");
const {
    listPeople,
    recentPeople,
    peopleStats,
} = require("../utils/people");
const {
    success,
    info,
} = require("../utils/feedback");

function peopleList() {
    const vault = getVaultPath();
    const people = listPeople(vault);

    if (people.length === 0) {
        info("Tidak ada People note.");
        return;
    }

    success(`People notes (${people.length})`);
    console.log("");
    people.forEach((person) => {
        console.log(`• ${person}`);
    });
}

function peopleRecentCommand() {
    const vault = getVaultPath();
    const people = recentPeople(vault);

    if (people.length === 0) {
        info("Tidak ada People note.");
        return;
    }

    success("Recently updated");
    console.log("");
    people.forEach((person) => {
        console.log(`• ${person}`);
    });
}

function peopleStatsCommand() {
    const vault = getVaultPath();
    const stats = peopleStats(vault);

    success("People statistics");
    console.log("");
    console.log(`Total notes: ${stats.total}`);
}

module.exports = {
    peopleList,
    peopleRecentCommand,
    peopleStatsCommand,
};
