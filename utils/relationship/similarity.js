const { stripCodeBlocks } = require("../tags");

// Bounds keep tokenization and candidate lookup predictable on large vaults.
const MAX_TOKENS_PER_NOTE = 300;
const MAX_TOKEN_LENGTH = 32;
const MIN_TOKEN_LENGTH = 2;
const MIN_SHARED_TOKENS = 3;
const DEFAULT_CANDIDATE_LIMIT = 250;
const MAX_REASON_ITEMS = 5;

// Body prose carries far more filler than note titles, so this list is kept
// separate from the title stopwords in checks/related.js. Changing one must not
// silently change the other.
const BODY_STOPWORDS = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "these",
    "those",
    "from",
    "into",
    "than",
    "then",
    "they",
    "them",
    "their",
    "there",
    "here",
    "have",
    "has",
    "had",
    "was",
    "were",
    "been",
    "being",
    "are",
    "but",
    "not",
    "you",
    "your",
    "our",
    "out",
    "all",
    "any",
    "can",
    "will",
    "would",
    "should",
    "could",
    "about",
    "which",
    "when",
    "where",
    "while",
    "also",
    "just",
    "only",
    "more",
    "most",
    "some",
    "such",
    "other",
    "over",
    "very",
    "one",
    "two",
    "new",
    "use",
    "used",
    "using",
    "note",
    "notes",
    "is",
    "it",
    "its",
    "as",
    "be",
    "am",
    "no",
    "so",
    "if",
    "or",
    "an",
    "at",
    "by",
    "on",
    "in",
    "to",
    "of",
    "we",
    "us",
    "my",
    "me",
    "he",
    "she",
    "his",
    "her",
    "him",
    "do",
    "does",
    "did",
    "https",
    "http",
    "www",
    "com",
    "org",
    "net",
    "md",
    "png",
    "jpg",
    "svg",
]);

// CJK, kana and hangul are written without spaces and without case, so a
// whitespace tokenizer would emit one character per token. Emitting
// overlapping bigrams keeps those languages comparable at the same cost.
const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

function stripFrontmatter(content) {
    return content.replace(FRONTMATTER, "\n");
}

function stripMarkdown(content) {
    return content
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (match, target, alias) =>
            alias ? alias : target
        )
        .replace(/https?:\/\/\S+/gi, " ")
        .replace(/^\s{0,3}#{1,6}\s+/gm, " ")
        .replace(/^\s{0,3}>\s?/gm, " ")
        .replace(/^\s{0,3}([-*+]|\d+[.)])\s+/gm, " ")
        .replace(/^\s{0,3}\|?[-= ]{3,}\|?\s*$/gm, " ")
        .replace(/[*_~]{1,3}/g, " ")
        .replace(/<[^>]+>/g, " ");
}

// Bounds how much of a single unspaced run is expanded, so one very long
// paragraph cannot dominate the token budget.
const MAX_CJK_RUN = 120;

function expandCjkTokens(content) {
    return content.replace(CJK_RUN, (run) => {
        const slice = run.length > MAX_CJK_RUN ? run.slice(0, MAX_CJK_RUN) : run;
        if (slice.length === 1) return ` ${slice} `;

        let out = "";
        for (let i = 0; i + 1 < slice.length; i += 1) {
            out += ` ${slice.slice(i, i + 2)} `;
        }
        return out;
    });
}

function tokenizeBody(content) {
    const cleaned = expandCjkTokens(
        stripMarkdown(stripCodeBlocks(stripFrontmatter(String(content || ""))))
    );

    const tokens = [];
    const seen = new Set();
    const runs = cleaned.match(/[\p{L}\p{N}]+/gu) || [];

    for (const run of runs) {
        if (run.length < MIN_TOKEN_LENGTH || run.length > MAX_TOKEN_LENGTH) {
            continue;
        }

        const token = run.toLowerCase();
        if (BODY_STOPWORDS.has(token) || seen.has(token)) {
            continue;
        }

        seen.add(token);
        tokens.push(token);

        if (tokens.length >= MAX_TOKENS_PER_NOTE) {
            break;
        }
    }

    return tokens;
}

function buildSimilarityIndex(notes) {
    const list = Array.isArray(notes) ? notes : [];
    const tokensByRelPath = new Map();
    const postings = new Map();

    for (const note of list) {
        const tokens = tokenizeBody(note.content);
        tokensByRelPath.set(note.relPath, tokens);

        for (const token of tokens) {
            if (!postings.has(token)) {
                postings.set(token, []);
            }
            postings.get(token).push(note.relPath);
        }
    }

    return { size: list.length, tokensByRelPath, postings };
}

// A token carried by most of the vault cannot tell two notes apart, and its
// posting list is the most expensive one to walk. The floor keeps small test
// vaults fully comparable.
function isDiscriminative(index, token) {
    const docs = index.postings.get(token) || [];
    return docs.length <= Math.max(8, Math.ceil(index.size / 2));
}

function sharedTokenCounts(index, note) {
    const own = index.tokensByRelPath.get(note.relPath) || [];
    const counts = new Map();

    if (own.length === 0) {
        return counts;
    }

    for (const token of own) {
        if (!isDiscriminative(index, token)) {
            continue;
        }

        const docs = index.postings.get(token);
        for (const relPath of docs) {
            if (relPath === note.relPath) {
                continue;
            }
            counts.set(relPath, (counts.get(relPath) || 0) + 1);
        }
    }

    return counts;
}

function cosineSimilarity(sizeA, sizeB, shared) {
    if (sizeA === 0 || sizeB === 0) {
        return 0;
    }
    return shared / Math.sqrt(sizeA * sizeB);
}

function sharedTokens(own, other, limit) {
    const ownIsSmaller = own.length <= other.length;
    const largerSet = new Set(ownIsSmaller ? other : own);
    const shared = [];

    for (const token of ownIsSmaller ? own : other) {
        if (largerSet.has(token)) {
            shared.push(token);
        }
    }

    shared.sort();
    return shared.slice(0, limit);
}

function findBodyMatches(index, note, options = {}) {
    if (!index) {
        return [];
    }

    const minShared = options.minSharedTokens || MIN_SHARED_TOKENS;
    const candidateLimit = options.candidateLimit || DEFAULT_CANDIDATE_LIMIT;
    const maxItems = options.maxReasonItems || MAX_REASON_ITEMS;

    const own = index.tokensByRelPath.get(note.relPath) || [];
    if (own.length < minShared) {
        return [];
    }

    const ranked = [...sharedTokenCounts(index, note).entries()]
        .filter(([, shared]) => shared >= minShared)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, candidateLimit);

    return ranked.map(([relPath, shared]) => {
        const other = index.tokensByRelPath.get(relPath) || [];
        return {
            relPath,
            shared,
            similarity: cosineSimilarity(own.length, other.length, shared),
            tokens: sharedTokens(own, other, maxItems),
        };
    });
}

module.exports = {
    MAX_TOKENS_PER_NOTE,
    MAX_TOKEN_LENGTH,
    MIN_TOKEN_LENGTH,
    MIN_SHARED_TOKENS,
    DEFAULT_CANDIDATE_LIMIT,
    MAX_REASON_ITEMS,
    MAX_CJK_RUN,
    BODY_STOPWORDS,
    stripFrontmatter,
    stripMarkdown,
    expandCjkTokens,
    tokenizeBody,
    buildSimilarityIndex,
    cosineSimilarity,
    sharedTokens,
    findBodyMatches,
};
