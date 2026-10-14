const { parseHeadings } = require("./relationship/parser");

// A note or template only carries useful structure if it has a handful of
// sections. The cap keeps a pathological file (hundreds of headings) from
// inflating every comparison.
const MAX_SECTIONS = 40;

// Section names in Obsidian templates and notes are free text, so they are
// compared after stripping decoration: case, markdown emphasis, trailing
// colons, wrapping brackets or quotes, emoji, and collapsed whitespace.
// Characters that carry meaning inside a name ("/", "+", "%", "@", digits, and
// CJK) are kept, so "Kesalahan / Bug" and "C++" survive normalization.
const DECORATION = /[\s\u00a0]+/g;
const EMPHASIS = /[*_`~]/g;
const PLACEHOLDER = /\{\{[\s\S]*?\}\}/g;
const EDGE_DECORATION =
    /^[\s:\-–—#*_`~.,;|!?"'“”‘’()[\]{}<>]+|[\s:\-–—#*_`~.,;|!?"'“”‘’()[\]{}<>]+$/g;
const EDGE_EMOJI = /^\p{Extended_Pictographic}\s*|\s*\p{Extended_Pictographic}+$/gu;

function normalizeHeadingText(text) {
    return String(text || "")
        .replace(PLACEHOLDER, " ")
        .replace(EMPHASIS, "")
        .replace(EDGE_DECORATION, "")
        .replace(EDGE_EMOJI, "")
        .replace(DECORATION, " ")
        .toLowerCase();
}

// Ordered, de-duplicated sections of a markdown body, keeping both the written
// text (for display) and the normalized name (for comparison). The level-1
// heading is skipped on purpose: in both notes and built-in templates it is
// the title, not a section, so comparing it would give every pair of documents
// one free point of similarity.
function sectionProfile(content, options = {}) {
    const limit = options.limit || MAX_SECTIONS;
    const sections = [];
    const seen = new Set();

    for (const heading of parseHeadings(String(content || ""))) {
        if (heading.level === 1) {
            continue;
        }

        const name = normalizeHeadingText(heading.text);
        if (!name || seen.has(name)) {
            continue;
        }

        seen.add(name);
        sections.push({ text: heading.text.trim(), name });

        if (sections.length >= limit) {
            break;
        }
    }

    return sections;
}

function sectionNames(content, options = {}) {
    return sectionProfile(content, options).map((section) => section.name);
}

// Longest common subsequence length, used as the "same sections in the same
// order" signal. Bounded by MAX_SECTIONS on both sides, so this stays a tiny
// dynamic program per comparison.
function lcsLength(a, b) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];

    if (left.length === 0 || right.length === 0) {
        return 0;
    }

    let previous = new Array(right.length + 1).fill(0);

    for (let i = 1; i <= left.length; i += 1) {
        const current = new Array(right.length + 1).fill(0);
        for (let j = 1; j <= right.length; j += 1) {
            current[j] =
                left[i - 1] === right[j - 1]
                    ? previous[j - 1] + 1
                    : Math.max(previous[j], current[j - 1]);
        }
        previous = current;
    }

    return previous[right.length];
}

// Overlap dominates the score; order and shape only break ties between two
// templates that share the same sections in a different arrangement.
const STRUCTURE_WEIGHTS = {
    overlap: 0.6,
    order: 0.2,
    shape: 0.2,
};

function roundScore(value) {
    // Rounding keeps the ranking stable against floating point noise, so equal
    // structures always fall through to the name tie-break.
    return Math.round(value * 10000) / 10000;
}

function structureSimilarity(a, b) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];

    if (left.length === 0 || right.length === 0) {
        return { overlap: 0, matched: [], union: 0, score: 0 };
    }

    const rightSet = new Set(right);
    const matched = [];
    const matchedSet = new Set();

    for (const name of left) {
        if (rightSet.has(name) && !matchedSet.has(name)) {
            matchedSet.add(name);
            matched.push(name);
        }
    }

    const overlap = matched.length;
    const union = left.length + right.length - overlap;
    const span = Math.max(left.length, right.length, 1);

    const overlapScore = overlap / union;
    const orderScore = lcsLength(left, right) / span;
    const shapeScore = Math.max(0, 1 - Math.abs(left.length - right.length) / span);

    const score = roundScore(
        STRUCTURE_WEIGHTS.overlap * overlapScore +
            STRUCTURE_WEIGHTS.order * orderScore +
            STRUCTURE_WEIGHTS.shape * shapeScore
    );

    return { overlap, matched, union, score };
}

module.exports = {
    MAX_SECTIONS,
    STRUCTURE_WEIGHTS,
    normalizeHeadingText,
    sectionProfile,
    sectionNames,
    lcsLength,
    structureSimilarity,
};