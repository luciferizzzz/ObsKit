// Helpers shared by the Smart Suggestions v2 recommenders (tags, folders).
// They only reshape the results that checks/related.js already produced: no
// scoring lives here, so relationship weights stay owned by one module.

const STRONG_RELATIONSHIP_REASONS = new Set(["backlink", "sharedLink"]);

function isStrongRelationship(result) {
    if (!result || !Array.isArray(result.reasons)) {
        return false;
    }

    return result.reasons.some((reason) =>
        STRONG_RELATIONSHIP_REASONS.has(reason && reason.type)
    );
}

function relatedKey(result) {
    const note = (result && result.note) || {};
    return String(note.relPath || note.name || "");
}

// Identity is the file path, not the basename: two notes can share a basename
// that differs only in case. Duplicate relationships (the same note listed
// twice) collapse to their highest-scoring entry so support counts stay
// honest. Results arrive sorted by score, so the first entry wins.
function dedupeRelated(results) {
    const list = Array.isArray(results) ? results : [];
    const seen = new Set();
    const out = [];

    for (const result of list) {
        if (!result || !result.note) {
            continue;
        }

        const relPath = relatedKey(result);
        if (seen.has(relPath)) {
            continue;
        }

        seen.add(relPath);
        out.push(result);
    }

    return out;
}

// Reason labels of one relationship, in the order checks/related.js pushed
// them (deterministic and documented there) and capped so summaries stay
// short.
function reasonLabels(result, maxItems = 2) {
    if (!result || !Array.isArray(result.reasons)) {
        return [];
    }

    const labels = [];
    const seen = new Set();

    for (const reason of result.reasons) {
        if (labels.length >= maxItems) {
            break;
        }

        if (!reason) continue;
        const label = reason.label || reason.type;
        if (!label || seen.has(label)) continue;

        seen.add(label);
        labels.push(label);
    }

    return labels;
}

module.exports = {
    STRONG_RELATIONSHIP_REASONS,
    isStrongRelationship,
    dedupeRelated,
    relatedKey,
    reasonLabels,
};