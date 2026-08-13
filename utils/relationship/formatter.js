const { normalizeNoteRef } = require("./validator");
const c = require("../colors");

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
        return `${prefix} ${c.note(`[[${target}]]`)}`;
    });
}

function formatRelations(result) {
    const { note, related, backlinks, outgoing } = result;
    const parts = [];
    const counts = [];

    parts.push(`\n${c.heading(`🔗 Relations for "${note}"`)}\n`);

    const uniqueRelated = dedupeLinks(related);
    const uniqueOutgoing = dedupeLinks(outgoing);

    if (uniqueRelated.length > 0) {
        parts.push(c.heading("Related"));
        parts.push(...formatLinkList(uniqueRelated));
        counts.push(`Related: ${c.value(uniqueRelated.length)}`);
    }

    if (backlinks.length > 0) {
        parts.push("", c.heading("Backlinks"));
        for (const link of backlinks) {
            const source = typeof link === "string" ? link : link.source;
            parts.push(`- ${c.note(source)}`);
        }
        counts.push(`Backlinks: ${c.value(backlinks.length)}`);
    }

    if (uniqueOutgoing.length > 0) {
        parts.push("", c.heading("Outgoing Links"));
        parts.push(...formatLinkList(uniqueOutgoing));
        counts.push(`Outgoing: ${c.value(uniqueOutgoing.length)}`);
    }

    if (counts.length === 0) {
        parts.push("No relationships found.");
    }

    parts.push("", c.divider("------------------------"));
    parts.push(counts.length > 0 ? counts.join(c.dim(" · ")) : "No relationships found.");

    return parts.join("\n");
}

function formatAddResult(note, related, added) {
    return added
        ? `\n✅ Related added.\n${c.note(note)} → ${c.note(related)}`
        : `\nℹ️  Already related.\n${c.note(note)} → ${c.note(related)}`;
}

function formatRemoveResult(note, related, removed) {
    return removed
        ? `\n✅ Related removed.\n${c.note(note)} → ${c.note(related)}`
        : `\nℹ️  Not related.\n${c.note(note)} → ${c.note(related)}`;
}

function formatSelfReferenceResult(note) {
    return `\n⚠️  Cannot relate a note to itself.\n${c.note(note)} → ${c.note(note)}`;
}

module.exports = {
    dedupeLinks,
    formatLinkList,
    formatRelations,
    formatAddResult,
    formatRemoveResult,
    formatSelfReferenceResult,
};
