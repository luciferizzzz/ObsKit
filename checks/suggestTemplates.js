const { sectionNames, structureSimilarity } = require("../utils/structure");
const { getTemplateCatalog } = require("../utils/templates");
const { titleTokens } = require("./related");

// Template recommendations are structural only: a note is compared against the
// section names of the built-in templates. Nothing is rendered, applied, or
// written back, so a wrong guess costs nothing but a dismissed line.
const MIN_TEMPLATE_SECTIONS = 2;
const MIN_TEMPLATE_SCORE = 0.35;
const MAX_TEMPLATE_SUGGESTIONS = 2;
const MAX_MATCHED_SECTIONS = 4;

function catalogOf(options) {
    if (Array.isArray(options && options.catalog)) {
        return options.catalog;
    }

    return getTemplateCatalog(options && options.templateDir);
}

// Only ever a tie-break: the "code" templates (js, html, css) share their
// section names, so a structurally identical note leaves them on an exact tie
// and the template whose name matches the note wins over pure alphabetical
// order. Structural score always comes first.
function nameAffinity(templateName, tokens) {
    if (!tokens || tokens.size === 0) {
        return 0;
    }

    let affinity = 0;
    for (const token of titleTokens(templateName)) {
        if (tokens.has(token)) {
            affinity += 1;
        }
    }

    return affinity;
}

function suggestTemplates(note, options = {}) {
    const limit = options.limit || MAX_TEMPLATE_SUGGESTIONS;
    const minSections = options.minSections || MIN_TEMPLATE_SECTIONS;
    const minScore = typeof options.minScore === "number" ? options.minScore : MIN_TEMPLATE_SCORE;
    const maxMatched = options.maxMatched || MAX_MATCHED_SECTIONS;

    const sections = sectionNames(note && note.content);

    // A note without real sections has no structure to match, so the cheap
    // early exit keeps the 19-template comparison off the hot path.
    if (sections.length < minSections) {
        return [];
    }

    const tokens = new Set([
        ...titleTokens((note && note.name) || ""),
        ...(note && Array.isArray(note.tags) ? note.tags : []).map((tag) =>
            String(tag).replace(/^#+/, "").toLowerCase()
        ),
    ]);

    const candidates = [];

    for (const template of catalogOf(options)) {
        if (!template || !Array.isArray(template.sections) || template.sections.length < minSections) {
            continue;
        }

        const similarity = structureSimilarity(sections, template.sections);

        if (similarity.overlap < minSections || similarity.score < minScore) {
            continue;
        }

        const labels = new Map();
        template.sections.forEach((name, index) => {
            const label = (template.sectionLabels && template.sectionLabels[index]) || name;
            if (!labels.has(name)) {
                labels.set(name, label);
            }
        });

        candidates.push({
            name: template.name,
            score: similarity.score,
            overlap: similarity.overlap,
            affinity: nameAffinity(template.name, tokens),
            matched: similarity.matched.map((name) => labels.get(name) || name),
        });
    }

    candidates.sort(
        (a, b) =>
            b.score - a.score ||
            b.overlap - a.overlap ||
            b.affinity - a.affinity ||
            a.name.localeCompare(b.name)
    );

    return candidates.slice(0, limit).map((candidate) => ({
        name: candidate.name,
        score: candidate.score,
        overlap: candidate.overlap,
        matched: candidate.matched.slice(0, maxMatched),
    }));
}

module.exports = {
    MIN_TEMPLATE_SECTIONS,
    MIN_TEMPLATE_SCORE,
    MAX_TEMPLATE_SUGGESTIONS,
    MAX_MATCHED_SECTIONS,
    suggestTemplates,
};