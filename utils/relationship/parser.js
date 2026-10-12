// Byte offsets of each line start, so offset -> line/column lookups stay
// exact and independent of how the content was split.
function buildLineStarts(content) {
    const starts = [0];

    for (let i = 0; i < content.length; i++) {
        if (content.charCodeAt(i) === 10) {
            starts.push(i + 1);
        }
    }

    return starts;
}

// 1-based line number for a byte offset. Binary search keeps large notes cheap.
function lineAtOffset(lineStarts, offset) {
    let low = 0;
    let high = lineStarts.length - 1;
    let result = 0;

    while (low <= high) {
        const mid = (low + high) >> 1;
        if (lineStarts[mid] <= offset) {
            result = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return result + 1;
}

function parseWikiLinks(content, options = {}) {
    const regex = /\[\[([^\]]+)\]\]/g;
    const links = [];
    let match;
    const withLines = Boolean(options && options.withLines);
    const lineStarts = withLines ? buildLineStarts(content) : null;

    while ((match = regex.exec(content)) !== null) {
        let rest = match[1].trim();
        if (!rest) continue;

        let alias = null;
        let heading = null;

        // [[Page|Alias]]
        if (rest.includes("|")) {
            const parts = rest.split("|");
            rest = parts[0];
            alias = parts.slice(1).join("|").trim() || null;
        }

        // [[Page#Heading]] or [[Page#^block]]
        if (rest.includes("#")) {
            const parts = rest.split("#");
            rest = parts[0];
            heading = parts.slice(1).join("#").trim() || null;
        }

        // [[Folder/Page]] -> Page
        const target = rest.split("/").pop().trim();

        // Skip attachments
        if (/\.(png|jpg|jpeg|gif|svg|webp|pdf|mp3|mp4|mov|wav|ogg)$/i.test(target)) {
            continue;
        }

        const link = {
            target,
            alias,
            heading,
            raw: match[1],
        };

        if (withLines) {
            link.line = lineAtOffset(lineStarts, match.index);
            link.offset = match.index;
        }

        links.push(link);
    }

    return links;
}

function normalizeTarget(target) {
    return String(target)
        .split("#")[0]
        .split("|")[0]
        .split("/")
        .pop()
        .trim()
        .toLowerCase();
}

function normalizeLink(link) {
    if (link && typeof link === "object") {
        return normalizeTarget(link.target);
    }
    return normalizeTarget(link);
}

function parseHeadings(content) {
    const headings = [];
    const regex = /^(#{1,6})\s+(.+?)\s*$/gm;
    let match;

    while ((match = regex.exec(content)) !== null) {
        headings.push({
            level: match[1].length,
            text: match[2].trim(),
        });
    }

    return headings;
}

function getSectionContent(content, heading) {
    const lines = content.split(/\r?\n/);
    const target = String(heading).trim().toLowerCase();
    const section = [];
    let inSection = false;

    for (const line of lines) {
        const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
        if (match) {
            if (inSection) break;
            if (match[2].trim().toLowerCase() === target) {
                inSection = true;
                continue;
            }
        }
        if (inSection) section.push(line);
    }

    while (section.length > 0 && section[section.length - 1] === "") {
        section.pop();
    }

    return section.join("\n");
}

module.exports = {
    parseWikiLinks,
    normalizeTarget,
    normalizeLink,
    parseHeadings,
    getSectionContent,
    buildLineStarts,
    lineAtOffset,
};
