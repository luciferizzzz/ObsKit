// AI Vault Context (v1.7.0) — deterministic retrieval + bounded context
// builder for `obs ask`.
//
// Retrieval is purely lexical and runs against the already-built vault index,
// so no filesystem reads and no network requests happen here. The module
// assembles the whole prompt context in memory; the command layer owns the
// single AI call.
//
// Reused infrastructure:
//   - utils/vaultIndex.js            single-scan note metadata + relationships
//   - checks/related.js              titleTokens (relationship scoring tokens)
//   - utils/relationship/similarity  tokenizeBody (Unicode/CJK aware)
//   - utils/tags.js                  tag extraction (through the index)
//   - checks/diagnostics.js          per-note vault issues, surfaced as warnings
//   - utils/search.js                normalizeQuery (question normalisation)

const { titleTokens } = require("./related");
const { tokenizeBody } = require("../utils/relationship/similarity");
const { collectDiagnostics } = require("./diagnostics");
const { normalizeQuery } = require("../utils/search");

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 12;

const DEFAULT_MAX_NOTES = 5;
const DEFAULT_MAX_CHARS_PER_NOTE = 1200;
const DEFAULT_MAX_TOTAL_CHARS = 6000;
const APPROX_CHARS_PER_TOKEN = 4;

const MIN_TOKEN_LENGTH = 2;
const MAX_POSITIONS_PER_TOKEN = 20;

// Relevance weights. Title/tag signals are author-declared, content terms are
// implicit, so they are weighted below them. `phrase` fires only when every
// word of a note title is present in the question.
const WEIGHTS = {
    phrase: 8,
    title: 5,
    tag: 4,
    content: 2,
};

// Display order is the order reasons are pushed below, so it is stable.
const REASON_ORDER = ["phrase", "title", "tag", "content"];

const QUESTION_STOPWORDS = new Set([
    // English question + function words
    "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
    "is", "are", "was", "were", "be", "been", "being", "am", "do", "does",
    "did", "can", "could", "will", "would", "shall", "should", "may", "might",
    "must", "the", "a", "an", "and", "or", "but", "if", "then", "than",
    "that", "this", "these", "those", "of", "to", "in", "on", "at", "for",
    "with", "from", "into", "about", "over", "under", "again", "further",
    "once", "here", "there", "all", "any", "both", "each", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own",
    "same", "so", "too", "very", "just", "now", "i", "me", "my", "we", "our",
    "you", "your", "he", "she", "it", "its", "they", "them", "their",
    "tell", "explain", "please", "give",
    // Indonesian question + function words
    "apa", "apakah", "apaan", "siapa", "kapan", "dimana", "di", "ke", "dari",
    "mana", "bagaimana", "bagaimanakah", "gimana", "kenapa", "mengapa",
    "napa", "yang", "yg", "dan", "atau", "itu", "ini", "untuk", "buat",
    "dengan", "pada", "adalah", "ialah", "ada", "tidak", "tak", "gak", "ga",
    "bukan", "bisa", "dapat", "akan", "sudah", "udah", "telah", "dalam",
    "oleh", "sebagai", "juga", "saya", "aku", "kamu", "anda", "kita", "kami",
    "mereka", "dia", "nya", "si", "sang", "para", "sebuah", "seekor", "suatu",
    "agar", "supaya", "karena", "sebab", "kalau", "kalo", "jika", "maka",
    "saat", "ketika", "setelah", "sebelum", "tentang", "mengenai", "pun",
    "lah", "kah", "ya", "deh", "dong", "sih", "kok", "kan", "aja", "saja",
    "mohon", "tolong", "coba", "jelasin", "jelaskan", "ceritakan", "sebutkan",
    "sebut", "kasih", "tau", "tahu", "berapa", "berapakah",
]);

// Code-unit comparison, deliberately not localeCompare, so ranking stays
// byte-identical across machines with different ICU locales.
function compareStrings(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeLimit(limit) {
    const parsed = parseInt(limit, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_LIMIT;
    }
    return Math.min(parsed, MAX_LIMIT);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Question terms: Unicode word runs, lowercased, deduped, question/function
// stopwords and single characters removed. Keeps content words intact.
function tokenizeQuestion(question) {
    const runs =
        String(question || "")
            .toLowerCase()
            .match(/[\p{L}\p{N}]+/gu) || [];
    const tokens = [];
    const seen = new Set();

    for (const run of runs) {
        if (run.length < MIN_TOKEN_LENGTH) continue;
        if (QUESTION_STOPWORDS.has(run)) continue;
        if (seen.has(run)) continue;
        seen.add(run);
        tokens.push(run);
    }

    return tokens;
}

function reasonsFor(titleHits, tagHits, contentHits, phrase) {
    const reasons = [];

    if (phrase) {
        reasons.push({ type: "phrase", label: "Exact title match", items: [] });
    }
    if (titleHits.length > 0) {
        reasons.push({ type: "title", label: "Title terms", items: titleHits });
    }
    if (tagHits.length > 0) {
        reasons.push({
            type: "tag",
            label: "Matching tags",
            items: tagHits.map((tag) => "#" + tag),
        });
    }
    if (contentHits.length > 0) {
        reasons.push({ type: "content", label: "Content terms", items: contentHits });
    }

    return reasons;
}

// Diagnostics are an annotation layer, not a ranking signal: a relevant note
// with a broken frontmatter block is still the note the user asked about.
function diagnosticsByRelPath(diagnostics) {
    const map = new Map();

    for (const diagnostic of diagnostics || []) {
        for (const item of diagnostic.items || []) {
            const relPath = typeof item === "string" ? item : item && item.file;
            if (!relPath) continue;
            if (!map.has(relPath)) map.set(relPath, new Set());
            map.get(relPath).add(diagnostic.code);
        }
    }

    const out = new Map();
    for (const [relPath, codes] of map) {
        out.set(relPath, [...codes].sort(compareStrings));
    }
    return out;
}

// Deterministic lexical ranking over index.notes. Every candidate is scored in
// one pass; nothing is read from disk again and duplicate basenames stay
// distinct because results key on relPath.
function retrieveContext(index, question, options = {}) {
    const query = String(question || "").trim();
    const tokens = tokenizeQuestion(normalizeQuery(query));
    const limit = normalizeLimit(options.limit);

    if (!index || !Array.isArray(index.notes) || tokens.length === 0) {
        return { query, tokens, results: [], candidateCount: 0 };
    }

    const diagnostics = diagnosticsByRelPath(
        options.diagnostics || collectDiagnostics(index)
    );
    const tokenSet = new Set(tokens);
    const results = [];

    for (const note of index.notes) {
        const noteTitleTokens = titleTokens(note.name);
        const titleHits = [];
        const titleSeen = new Set();

        for (const token of noteTitleTokens) {
            if (titleSeen.has(token) || !tokenSet.has(token)) continue;
            titleSeen.add(token);
            titleHits.push(token);
        }
        titleHits.sort(compareStrings);

        const phrase =
            noteTitleTokens.length > 0 &&
            noteTitleTokens.every((token) => tokenSet.has(token));

        const tagSet = new Set((note.tags || []).map((tag) => String(tag).toLowerCase()));
        const tagHits = tokens.filter((token) => tagSet.has(token)).sort(compareStrings);

        // Token match is the fast path; the raw substring fallback keeps CJK
        // questions working, because tokenizeBody expands CJK runs into bigrams
        // that a 3+ character query term would never match.
        const bodySet = new Set(tokenizeBody(note.content));
        const bodyLower = String(note.content || "").toLowerCase();
        const contentHits = tokens
            .filter((token) => bodySet.has(token) || bodyLower.includes(token))
            .sort(compareStrings);

        let score = 0;
        if (phrase) score += WEIGHTS.phrase;
        score += WEIGHTS.title * titleHits.length;
        score += WEIGHTS.tag * tagHits.length;
        score += WEIGHTS.content * contentHits.length;

        if (score <= 0) continue;

        results.push({
            note,
            score,
            reasons: reasonsFor(titleHits, tagHits, contentHits, phrase),
            diagnostics: diagnostics.get(note.relPath) || [],
        });
    }

    results.sort(
        (a, b) =>
            b.score - a.score ||
            compareStrings(a.note.relPath, b.note.relPath)
    );

    return {
        query,
        tokens,
        results: results.slice(0, limit),
        candidateCount: results.length,
    };
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Match positions are collected on the original content (case-insensitive
// regex, not a lowercased copy) so the window index stays valid for Unicode
// text whose lowercase form changes length.
function matchPositions(content, tokens) {
    const positions = [];

    for (const token of tokens) {
        if (token.length < MIN_TOKEN_LENGTH) continue;
        const re = new RegExp(escapeRegExp(token), "gi");
        let match;
        let count = 0;

        while ((match = re.exec(content)) !== null && count < MAX_POSITIONS_PER_TOKEN) {
            positions.push(match.index);
            count++;
            if (match.index === re.lastIndex) re.lastIndex++;
        }
    }

    positions.sort((a, b) => a - b);
    return positions;
}

// Window (in original-content coordinates) that covers the most question-term
// hits. Falls back to the start of the note when nothing matches.
function densestWindow(content, tokens, windowSize) {
    const positions = matchPositions(content, tokens);

    if (positions.length === 0) {
        return 0;
    }

    let bestStart = 0;
    let bestHits = 0;
    let left = 0;

    for (let right = 0; right < positions.length; right++) {
        while (positions[right] - positions[left] > windowSize) {
            left++;
        }
        const hits = right - left + 1;
        if (hits > bestHits) {
            bestHits = hits;
            bestStart = positions[left];
        }
    }

    return Math.max(0, bestStart - Math.floor(windowSize * 0.15));
}

function extractExcerpt(note, tokens, maxChars) {
    const content = String(note.content || "");

    if (!content) {
        return { text: "", truncated: false };
    }

    if (content.length <= maxChars) {
        return { text: content, truncated: false };
    }

    const start = densestWindow(content, tokens, maxChars);
    let end = Math.min(content.length, start + maxChars);
    let begin = start;
    if (end - begin < maxChars) {
        begin = Math.max(0, end - maxChars);
        end = Math.min(content.length, begin + maxChars);
    }

    const prefix = begin > 0 ? "…" : "";
    const suffix = end < content.length ? "…" : "";

    return {
        text: prefix + content.slice(begin, end) + suffix,
        truncated: true,
    };
}

function renderContextText(query, selected, meta) {
    if (selected.length === 0) {
        return (
            `Tidak ada catatan relevan yang ditemukan di vault untuk pertanyaan: ` +
            `"${query}". Konteks tidak cukup untuk menjawab.`
        );
    }

    const lines = [];
    lines.push(`Pertanyaan: ${query}`);
    const total = selected.length + meta.dropped;
    const scope =
        meta.dropped > 0 ? ` (${selected.length} dari ${total} teratas)` : "";
    lines.push(`Sumber catatan${scope}, diurutkan berdasarkan relevansi:`);
    lines.push("");

    selected.forEach((result, index) => {
        lines.push(
            `[${index + 1}] ${result.note.relPath} (skor relevansi: ${result.score})`
        );
        if (result.diagnostics.length > 0) {
            lines.push(
                `Catatan: sumber ini punya isu vault (${result.diagnostics.join(", ")}) ` +
                `- metadata/struktur mungkin tidak sepenuhnya reliabel.`
            );
        }
        lines.push(result.excerpt || "(kosong)");
        lines.push("");
    });

    if (meta.truncated) {
        lines.push(
            `Batasan: konteks ini hanya sebagian. ${meta.dropped} catatan relevan lain ` +
            `tidak disertakan karena batas ukuran, jadi jawaban bisa kurang lengkap.`
        );
    }

    return lines.join("\n").trim();
}

// Turns ranked retrieval into a bounded, source-attributed context block.
// Never assumes it saw the whole vault: `truncated`/`dropped` tell the caller
// (and the model) when only a subset was included.
function buildContext(retrieval, options = {}) {
    const maxNotes = clamp(
        options.maxNotes || DEFAULT_MAX_NOTES,
        1,
        MAX_LIMIT
    );
    const maxCharsPerNote = options.maxCharsPerNote || DEFAULT_MAX_CHARS_PER_NOTE;
    const maxTotalChars = options.maxTotalChars || DEFAULT_MAX_TOTAL_CHARS;

    const candidates = (retrieval && retrieval.results) || [];
    const tokens = (retrieval && retrieval.tokens) || [];
    const query = (retrieval && retrieval.query) || "";

    const selected = [];
    let usedChars = 0;
    let truncated = false;

    for (const result of candidates) {
        if (selected.length >= maxNotes) {
            truncated = true;
            break;
        }

        const excerpt = extractExcerpt(result.note, tokens, maxCharsPerNote);
        const overhead = result.note.relPath.length + 20;

        if (
            selected.length > 0 &&
            usedChars + excerpt.text.length + overhead > maxTotalChars
        ) {
            truncated = true;
            break;
        }

        selected.push({ ...result, excerpt: excerpt.text, excerptTruncated: excerpt.truncated });
        usedChars += excerpt.text.length + overhead;

        if (excerpt.truncated) truncated = true;
    }

    const dropped = Math.max(0, candidates.length - selected.length);
    const text = renderContextText(query, selected, { truncated, dropped });

    return {
        query,
        tokens,
        notes: selected,
        text,
        usedChars,
        approxTokens: Math.ceil(usedChars / APPROX_CHARS_PER_TOKEN),
        selectedCount: selected.length,
        candidateCount: candidates.length,
        truncated,
        hasContext: selected.length > 0,
    };
}

module.exports = {
    DEFAULT_LIMIT,
    MAX_LIMIT,
    DEFAULT_MAX_NOTES,
    DEFAULT_MAX_CHARS_PER_NOTE,
    DEFAULT_MAX_TOTAL_CHARS,
    APPROX_CHARS_PER_TOKEN,
    MIN_TOKEN_LENGTH,
    WEIGHTS,
    REASON_ORDER,
    QUESTION_STOPWORDS,
    compareStrings,
    normalizeLimit,
    tokenizeQuestion,
    retrieveContext,
    buildContext,
};
