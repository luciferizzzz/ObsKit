const { countPendingTasks } = require("./health");
const { getSectionContent } = require("../utils/relationship/parser");

const PERIODS = {
    today: 1,
    week: 7,
    month: 30,
};

function resolvePeriod(period, daysOption) {
    if (daysOption !== undefined && daysOption !== null && daysOption !== "") {
        const days = Math.max(1, parseInt(daysOption, 10) || 7);
        return {
            days,
            label: `Last ${days} days`,
        };
    }

    const key = String(period || "week").trim().toLowerCase();
    const days = PERIODS[key] || PERIODS.week;

    return {
        days,
        label: key === "today" ? "Today" : capitalize(key),
    };
}

function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function startDate(days) {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    return start;
}

function aggregateReview(index, options = {}) {
    const start = options.start || startDate(options.days || 7);
    const startMs = start.getTime();

    const created = [];
    const modified = [];
    const tagCount = {};
    let pendingTasks = 0;
    let relationships = 0;
    let brokenLinks = 0;
    const orphansCreated = [];

    for (const note of index.notes) {
        const modifiedInPeriod =
            new Date(note.mtime).getTime() >= startMs && note.mtime <= new Date();

        const createdInPeriod =
            new Date(note.created).getTime() >= startMs && note.created <= new Date();

        if (createdInPeriod) {
            created.push(note);
        }

        if (modifiedInPeriod) {
            modified.push(note);
        }

        const pending = countPendingTasks(note.content);
        pendingTasks += pending;

        const relatedSection = getSectionContent(note.content, "Related");
        if (relatedSection) {
            const relatedLinks = note.outgoingDetails.filter(
                (link) => relatedSection.includes(link.raw)
            );
            relationships += relatedLinks.length;
        }

        for (const target of note.outgoing) {
            if (!index.byName.has(target)) brokenLinks++;
        }

        if (createdInPeriod && !index.referenced.has(note.name.toLowerCase())) {
            orphansCreated.push(note);
        }

        for (const tag of note.tags) {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
        }
    }

    const activeTags = Object.entries(tagCount)
        .sort(
            (a, b) =>
                b[1] - a[1] ||
                a[0].localeCompare(b[0])
        )
        .slice(0, 10);

    const createdSorted = created
        .slice()
        .sort((a, b) => new Date(b.created) - new Date(a.created));
    const modifiedSorted = modified
        .slice()
        .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

    return {
        days: options.days || 7,
        start,
        created: createdSorted,
        modified: modifiedSorted,
        createdCount: createdSorted.length,
        modifiedCount: modifiedSorted.length,
        activeTags,
        pendingTasks,
        relationships,
        brokenLinks,
        orphansCreated,
        orphansCreatedCount: orphansCreated.length,
    };
}

module.exports = {
    PERIODS,
    resolvePeriod,
    startDate,
    aggregateReview,
};