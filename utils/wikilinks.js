const { parseWikiLinks } = require("./relationship/parser");

function extractWikiLinks(content) {
    return parseWikiLinks(content).map((link) => {
        return link.heading ? `${link.target}#${link.heading}` : link.target;
    });
}

module.exports = {
    extractWikiLinks,
};
