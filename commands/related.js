const { getVaultPath } = require("../utils/vault");
const { buildVaultIndex } = require("../utils/vaultIndex");
const { findRelatedNotes } = require("../checks/related");
const { error, info } = require("../utils/feedback");
const c = require("../utils/colors");

function related(noteRef, options = {}) {
    const name = String(noteRef || "").trim();

    if (!name) {
        error("Note name is required.");
        return;
    }

    const vault = getVaultPath();
    const vaultIndex = buildVaultIndex(vault);
    const limit = parseInt(options.limit || options.n, 10) || 10;

    const { target, results } = findRelatedNotes(vaultIndex, name, { limit });

    if (!target) {
        error(`Note not found: ${name}`);
        return;
    }

    if (results.length === 0) {
        info(`No related notes found for "${target.name}".`);
        return;
    }

    console.log(`\n${c.heading("🔗 Related Notes")}\n`);
    console.log(`  Based on   : ${c.note(target.relPath)}\n`);

    results.forEach((result, i) => {
        console.log(`${i + 1}. ${c.title(result.note.name)}`);

        const ordered = result.reasons.slice().sort((a, b) => {
            const rank = {
                sharedTag: 0,
                sharedLink: 1,
                backlink: 2,
                sharedBacklink: 3,
                titleToken: 4,
            };
            return rank[a.type] - rank[b.type];
        });

        for (const reason of ordered) {
            if (reason.type === "backlink") {
                console.log(`   ${c.dim("Links to this note:")} ${c.note("yes")}`);
                continue;
            }
            if (reason.items.length > 0) {
                console.log(`   ${c.dim(`${reason.label}:`)} ${reason.items
                    .map((item) => c.note(item))
                    .join(", ")}`);
            }
        }

        if (result.note.backlinks.length > 0) {
            console.log(`   ${c.dim("Backlinks:")} ${c.note(result.note.backlinks.length)}`);
        }

        console.log("");
    });

    console.log(c.divider("────────────────────────"));
    console.log(`${c.title("Total Related")} : ${c.value(results.length)}`);
}

module.exports = related;