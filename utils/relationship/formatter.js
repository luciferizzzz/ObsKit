const { normalizeNoteRef } = require("./validator");

function dedupeLinks(links) {
    const seen = new Set();
    const result = [];

    for (const link of links) {
        const target = typeof link === "string" ? link : link.target;
        const key = normalizeNoteRef(target);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(link);
    }

    return result;
}

function formatLinkList(items, prefix = "-") {
    return items.map((item) => {
        const target = typeof item === "string" ? item : item.target;
        return `${prefix} [[${target}]]`;
    });
}

function formatRelations(result) {
    const { note, related, backlinks, outgoing } = result;
    const parts = [];
    const counts = [];

    parts.push(`\n🔗 Relations for "${note}"\n`);

    const uniqueRelated = dedupeLinks(related);
    const uniqueOutgoing = dedupeLinks(outgoing);

    if (uniqueRelated.length > 0) {
        parts.push("Related");
        parts.push(...formatLinkList(uniqueRelated));
        counts.push(`Related: ${uniqueRelated.length}`);
    }

    if (backlinks.length > 0) {
        parts.push("", "Backlinks");
        for (const link of backlinks) {
            const source = typeof link === "string" ? link : link.source;
            parts.push(`- ${source}`);
        }
        counts.push(`Backlinks: ${backlinks.length}`);
    }

    if (uniqueOutgoing.length > 0) {
        parts.push("", "Outgoing Links");
        parts.push(...formatLinkList(uniqueOutgoing));
        counts.push(`Outgoing: ${uniqueOutgoing.length}`);
    }

    if (counts.length === 0) {
        parts.push("No relationships found.");
    }

    parts.push("", "------------------------");
    parts.push(counts.length > 0 ? counts.join(" · ") : "No relationships found.");

    return parts.join("\n");
}

function formatAddResult(note, related, added) {
    return added
        ? `\n✅ Related added.\n${note} → ${related}`
        : `\nℹ️  Already related.\n${note} → ${related}`;
}

function formatRemoveResult(note, related, removed) {
    return removed
        ? `\n✅ Related removed.\n${note} → ${related}`
        : `\nℹ️  Not related.\n${note} → ${related}`;
}

function formatSelfReferenceResult(note) {
    return `\n⚠️  Cannot relate a note to itself.\n${note} → ${note}`;
}

module.exports = {
    dedupeLinks,
    formatLinkList,
    formatRelations,
    formatAddResult,
    formatRemoveResult,
    formatSelfReferenceResult,
};
