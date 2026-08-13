const fs = require("fs");

const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { buildNormalizedNoteIndex } = require("../utils/noteIndex");
const { extractWikiLinks} = require("../utils/wikilinks");

function checkDeadlinks() {
    const vault = getVaultPath();

    const files = scanMarkdownFiles(vault);
    const notes = buildNormalizedNoteIndex(files);

    const broken = [];
    let totalLinks = 0;

    for (const file of files) {
        const content = fs.readFileSync(file, "utf8");
        const links = extractWikiLinks(content);

        totalLinks += links.length;

        for (const link of links) {
            const clean = link.split("#")[0].trim().toLowerCase();

            if (!notes.has(clean)) {
                broken.push({
                    file,
                    link,
                });
            }
        }

    }

    return {
        vault,
        files,
        totalLinks,
        broken,
    };

}

module.exports = checkDeadlinks;