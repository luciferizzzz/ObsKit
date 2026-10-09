const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildVaultIndex } = require("../utils/vaultIndex");
const { buildSuggestions } = require("../checks/suggest");
const { suggestTags, MIN_TAG_SUPPORT } = require("../checks/suggestTags");
const { suggestFolders, folderAncestors } = require("../checks/suggestFolders");
const {
    suggestTemplates,
    MIN_TEMPLATE_SECTIONS,
} = require("../checks/suggestTemplates");
const {
    normalizeHeadingText,
    sectionNames,
    structureSimilarity,
    lcsLength,
} = require("../utils/structure");
const { folderOf, isSelfOrAncestor, displayFolder } = require("../utils/folders");
const {
    dedupeRelated,
    isStrongRelationship,
    reasonLabels,
} = require("../utils/relationship/relatedContext");
const { loadTemplates, getTemplateCatalog, clearTemplateCache } = require("../utils/templates");

const TEMPLATE_DIR = path.join(__dirname, "..", "templates");

// ─── Helpers ─────────────────────────────────────────────────────────

function buildDir(files, prefix = "obs-suggest-v2-") {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    writeFiles(root, files);
    return root;
}

function writeFiles(root, files) {
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return root;
}

function withVault(root, fn) {
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    try {
        return fn();
    } finally {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    }
}

async function withVaultAsync(root, fn) {
    const previous = process.env.OBSKIT_VAULT;
    process.env.OBSKIT_VAULT = root;
    try {
        return await fn();
    } finally {
        if (previous === undefined) {
            delete process.env.OBSKIT_VAULT;
        } else {
            process.env.OBSKIT_VAULT = previous;
        }
    }
}

function capture(fn) {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.map(String).join(" "));
    try {
        return fn();
    } finally {
        console.log = original;
    }
}

async function captureAsync(fn) {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.map(String).join(" "));
    try {
        await fn();
    } finally {
        console.log = original;
    }
    return logs.join("\n");
}

function hashTree(root) {
    const hashes = new Map();

    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
            a.name.localeCompare(b.name)
        )) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else {
                const digest = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
                hashes.set(path.relative(root, full).split(path.sep).join("/"), digest);
            }
        }
    }

    walk(root);

    return hashes;
}

// A hand-built index lets the recommenders be exercised with tag and path
// shapes the scanner itself cannot produce (Unicode tags, duplicate entries).
function fakeIndex(notes) {
    const list = notes.map((note) => ({
        content: "",
        size: 1,
        outgoing: [],
        outgoingDetails: [],
        tags: [],
        backlinks: [],
        ...note,
    }));

    const byName = new Map(list.map((note) => [note.name.toLowerCase(), note]));

    return { vault: "", files: [], notes: list, byName, referenced: new Set() };
}

function relatedNote(relPath, tags, overrides = {}) {
    return {
        name: path.basename(relPath, ".md"),
        relPath,
        tags,
        ...overrides,
    };
}

function related(result, extra = {}) {
    return {
        note: result.note,
        score: extra.score || 4,
        reasons: extra.reasons || [{ type: "sharedTag", label: "Shared tags", items: [] }],
        ...extra,
    };
}

const STRONG = [{ type: "backlink", label: "Backlinks to this note", items: [] }];
const WEAK = [{ type: "titleToken", label: "Title overlap", items: ["alpha"] }];

function recommend(root, name, options = {}) {
    return buildSuggestions(buildVaultIndex(root), name, options).recommendations;
}

// ─── Suggested Tags ──────────────────────────────────────────────────

test("suggest tags: recommends co-occurring tags from related notes", () => {
    const root = buildDir({
        "Notes/Learning Rust.md": "# Learning Rust\n\n#rust\n\nOwnership rules.\n",
        "Projects/ObsKit/Design.md": "# Design\n\n#rust #cli #rust-cli\n",
        "Projects/ObsKit/Api.md": "# Api\n\n#rust #cli #rust-cli #backend\n",
        "Journal/Rust Cli.md": "# Rust Cli\n\n#rust-cli #rust #tooling\n",
    });

    const { tags } = recommend(root, "Learning Rust");
    const names = tags.map((item) => item.tag);

    assert.deepEqual(names, ["rust-cli", "cli"]);
    assert.equal(tags[0].support, 3);
    assert.deepEqual(tags[0].sources, ["Api", "Design", "Rust Cli"]);
    assert.equal(tags[1].support, 2);
});

test("suggest tags: never recommends a tag the note already has", () => {
    const root = buildDir({
        "Notes/Learning Rust.md": "# Learning Rust\n\n#rust #cli\n\ntext\n",
        "Projects/A.md": "# A\n\n#rust #cli #rust-cli #backend\n",
        "Projects/B.md": "# B\n\n#rust #cli #rust-cli #frontend\n",
    });

    const { tags } = recommend(root, "Learning Rust");

    assert.deepEqual(tags.map((item) => item.tag), ["rust-cli"]);
});

test("suggest tags: a single weak relationship is not enough", () => {
    const root = buildDir({
        "Notes/Alpha.md": "# Alpha\n\ntext\n",
        "Notes/Alpha Two.md": "# Alpha Two\n\n#rust #cli\n",
    });

    const { tags } = recommend(root, "Alpha");

    assert.deepEqual(tags, []);
});

test("suggest tags: one explicitly linked note is enough", () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\ntext\n",
        "Leaves/Leaf.md": "# Leaf\n\n[[Hub]]\n\n#rust #cli\n",
    });

    const { tags } = recommend(root, "Hub");

    assert.deepEqual(tags.map((item) => item.tag), ["cli", "rust"]);
    assert.ok(tags.every((item) => item.linked === true));
    assert.ok(tags.every((item) => item.support === 1));
});

test("suggest tags: duplicate relationships are counted once", () => {
    const note = relatedNote("Notes/Hub.md", []);
    const leaf = relatedNote("Leaves/Leaf.md", ["rust"]);

    const once = suggestTags(note, [related({ note: leaf }, { reasons: WEAK })]);
    const twice = suggestTags(note, [
        related({ note: leaf }, { reasons: WEAK }),
        related({ note: leaf }, { reasons: WEAK, score: 2 }),
    ]);

    assert.deepEqual(once, []);
    assert.deepEqual(twice, []);
});

test("suggest tags: unicode tags are preserved and ordered deterministically", () => {
    const index = fakeIndex([
        { name: "Hub", relPath: "Notes/Hub.md", tags: [] },
        {
            name: "A",
            relPath: "Notes/A.md",
            tags: ["réunion", "プロジェクト"],
        },
        {
            name: "B",
            relPath: "Notes/B.md",
            tags: ["réunion", "プロジェクト", "Zebra"],
        },
    ]);

    const tags = suggestTags(index.notes[0], [
        related({ note: index.notes[1] }, { score: 9 }),
        related({ note: index.notes[2] }, { score: 5 }),
    ]);

    // "zebra" only has one supporter, so the conservative rule drops it.
    assert.deepEqual(tags.map((item) => item.tag), ["réunion", "プロジェクト"]);
    assert.equal(tags[0].support, 2);
    assert.equal(tags[0].score, 14);
    assert.deepEqual(tags[1].sources, ["A", "B"]);
});

test("suggest tags: tag keys are case-insensitive and de-duplicated", () => {
    const note = relatedNote("Notes/Hub.md", ["CLI"]);
    const leaf = relatedNote("Leaves/Leaf.md", ["#RUST", "Rust", "rust-cli"]);

    const tags = suggestTags(note, [related({ note: leaf }, { reasons: STRONG })]);

    assert.deepEqual(tags.map((item) => item.tag), ["rust", "rust-cli"]);
});

test("suggest tags: capped at five and ordered by score then support then name", () => {
    const note = relatedNote("Notes/Hub.md", []);
    const relatedNotes = [
        ["A", ["t1", "t2", "t3", "t4", "t5", "t6", "t7"], 3],
        ["B", ["t1", "t6", "t7", "t8", "t9"], 2],
        ["C", ["t2", "t6", "t7", "t8", "t10"], 1],
    ].map(([name, tags, score]) =>
        related({ note: relatedNote(`Notes/${name}.md`, tags) }, { score })
    );

    const tags = suggestTags(note, relatedNotes);

    assert.equal(tags.length, 5, "cap of five");
    assert.deepEqual(tags.map((item) => item.tag), ["t6", "t7", "t1", "t2", "t8"]);
    assert.deepEqual(
        tags.map((item) => item.score),
        [...tags.map((item) => item.score)].sort((a, b) => b - a)
    );
    assert.deepEqual(tags.slice(0, 2).map((item) => item.support), [3, 3]);
    assert.deepEqual(tags.slice(2).map((item) => item.support), [2, 2, 2]);
});

test("suggest tags: repeated runs are byte-identical", () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\n#rust\n\n[[A]]\n",
        "Projects/A.md": "# A\n\n#rust-cli #cli\n\n[[B]]\n",
        "Projects/B.md": "# B\n\n#rust-cli #backend\n\n[[C]]\n",
        "Projects/C.md": "# C\n\n#rust-cli #frontend\n",
    });

    const first = recommend(root, "Hub");
    const second = recommend(root, "Hub");
    const third = recommend(root, "Hub");

    assert.deepEqual(first, second);
    assert.deepEqual(second, third);
});

test("suggest tags: the shared minimum support is two", () => {
    assert.equal(MIN_TAG_SUPPORT, 2);
});

// ─── Suggested Folders ───────────────────────────────────────────────

test("suggest folders: recommends folders where related notes live", () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\n#rust\n",
        "Projects/ObsKit/Design.md": "# Design\n\n#rust\n",
        "Projects/ObsKit/Api.md": "# Api\n\n#rust\n",
        "Journal/Scratch.md": "# Scratch\n\n#rust\n",
    });

    const { folders } = recommend(root, "Hub");

    // Two notes sit in Projects/ObsKit, one in Journal. Journal only has a
    // single supporter, so it never reaches the minimum support. On a tie the
    // deeper (more specific) folder wins.
    assert.deepEqual(folders.map((item) => item.folder), [
        "Projects/ObsKit",
        "Projects",
    ]);
    assert.equal(folders[0].support, 2);
    assert.equal(folders[0].score, 4);
    assert.deepEqual(folders[0].signals, ["Shared tags"]);
    assert.deepEqual(folders[0].sources, ["Api", "Design"]);
});

test("suggest folders: never suggests the note's own folder or an ancestor", () => {
    const root = buildDir({
        "Projects/ObsKit/Design/Hub.md": "# Hub\n\n#rust\n",
        "Projects/ObsKit/Design/A.md": "# A\n\n#rust\n",
        "Projects/ObsKit/Design/B.md": "# B\n\n#rust\n",
    });

    const { folders } = recommend(root, "Hub");

    assert.deepEqual(folders, []);
});

test("suggest folders: nested folders are reported at every level", () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\n#rust\n",
        "Projects/ObsKit/Backend/Api.md": "# Api\n\n#rust\n",
        "Projects/ObsKit/Backend/Worker.md": "# Worker\n\n#rust\n",
    });

    const { folders } = recommend(root, "Hub");

    assert.deepEqual(folders.map((item) => item.folder), [
        "Projects/ObsKit/Backend",
        "Projects/ObsKit",
        "Projects",
    ]);
});

test("suggest folders: root-level related notes never create a folder candidate", () => {
    const index = fakeIndex([
        { name: "Hub", relPath: "Notes/Hub.md", tags: [] },
        { name: "Root A", relPath: "Root A.md", tags: ["rust"] },
        { name: "Root B", relPath: "Root B.md", tags: ["rust"] },
    ]);

    const folders = suggestFolders(index.notes[0], [
        related({ note: index.notes[1] }),
        related({ note: index.notes[2] }),
    ]);

    assert.deepEqual(folders, []);
});

test("suggest folders: unicode and emoji folder paths survive", () => {
    const root = buildDir({
        "Catatan/Ide/Apa.md": "# Apa\n\n#rust\n",
        "Catatan/🚀 Rocket/Mulai.md": "# Mulai\n\n#rust\n",
        "Catatan/🚀 Rocket/Lanjut.md": "# Lanjut\n\n#rust\n",
    });

    const { folders } = recommend(root, "Apa");

    // The note sits under Catatan/Ide, so Catatan is an ancestor of its own
    // folder and stays out; the cluster lives in Catatan/🚀 Rocket.
    assert.deepEqual(folders.map((item) => item.folder), ["Catatan/🚀 Rocket"]);
    assert.equal(folders[0].support, 2);
    assert.deepEqual(folders[0].sources, ["Lanjut", "Mulai"]);
});

test("suggest folders: display form uses the platform separator", () => {
    const root = buildDir({
        "Notes/Apa.md": "# Apa\n\n#rust\n",
        "Catatan/🚀 Rocket/Mulai.md": "# Mulai\n\n#rust\n",
        "Catatan/🚀 Rocket/Lanjut.md": "# Lanjut\n\n#rust\n",
    });

    const { folders } = recommend(root, "Apa");

    assert.deepEqual(folders.map((item) => item.folder), [
        "Catatan/🚀 Rocket",
        "Catatan",
    ]);
    assert.equal(displayFolder("Catatan/🚀 Rocket"), path.join("Catatan", "🚀 Rocket"));
    assert.equal(displayFolder("Projects/ObsKit"), path.join("Projects", "ObsKit"));
});

test("suggest folders: a single explicitly linked note is enough", () => {
    const index = fakeIndex([
        { name: "Hub", relPath: "Notes/Hub.md", tags: [] },
        { name: "Leaf", relPath: "Leaves/Deep/Leaf.md", tags: [] },
    ]);

    const folders = suggestFolders(index.notes[0], [
        related({ note: index.notes[1] }, { reasons: STRONG, score: 10 }),
    ]);

    assert.deepEqual(folders.map((item) => item.folder), ["Leaves/Deep", "Leaves"]);
    assert.ok(folders.every((item) => item.linked === true));
    assert.ok(folders.every((item) => item.support === 1));
});

test("suggest folders: repeated runs are byte-identical", () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\n#rust\n",
        "Projects/A.md": "# A\n\n#rust\n",
        "Projects/B.md": "# B\n\n#rust\n",
        "Archive/C.md": "# C\n\n#rust\n",
    });

    assert.deepEqual(recommend(root, "Hub"), recommend(root, "Hub"));
});

test("folder helpers: folderOf, isSelfOrAncestor, folderAncestors", () => {
    assert.equal(folderOf("Notes/Hub.md"), "Notes");
    assert.equal(folderOf("Projects/ObsKit/Backend/Api.md"), "Projects/ObsKit/Backend");
    assert.equal(folderOf("Hub.md"), "");
    assert.equal(folderOf("Projects\\ObsKit\\Api.md"), "Projects/ObsKit");
    assert.equal(folderOf(undefined), "");

    assert.equal(isSelfOrAncestor("Projects", "Projects"), true);
    assert.equal(isSelfOrAncestor("Projects", "Projects/ObsKit"), true);
    assert.equal(isSelfOrAncestor("Projects/ObsKit", "Projects"), false);
    assert.equal(isSelfOrAncestor("", "Projects"), false);

    assert.deepEqual(folderAncestors("Projects/ObsKit/Backend"), [
        "Projects/ObsKit/Backend",
        "Projects/ObsKit",
        "Projects",
    ]);
    assert.deepEqual(folderAncestors(""), []);
});

// ─── Suggested Templates ─────────────────────────────────────────────

test("suggest templates: recommends the structurally closest template", () => {
    const root = buildDir({
        "Decisions/Database Choice.md": [
            "# Database Choice",
            "",
            "## Konteks",
            "we need a database",
            "## Opsi",
            "- postgres",
            "## Keputusan",
            "postgres",
            "## Alasan",
            "because",
            "## Konsekuensi",
            "more ops",
            "## Review",
            "later",
            "## Catatan",
            "-",
        ].join("\n"),
    });

    const { templates } = recommend(root, "Database Choice");

    assert.ok(templates.length > 0);
    assert.equal(templates[0].name, "decision");
    assert.equal(templates[0].score, 1);
    assert.ok(templates[0].matched.includes("Keputusan"));
    assert.ok(templates[0].matched.includes("Alasan"));
    assert.ok(templates.length <= 2, "recommendations stay capped");
});

test("suggest templates: a note without sections gets no template", () => {
    const root = buildDir({
        "Notes/Blank.md": "# Blank\n\njust one paragraph\n",
        "Notes/Other.md": "# Other\n\n## Konteks\n\nsomething\n",
    });

    const { templates } = recommend(root, "Blank");

    assert.deepEqual(templates, []);
});

test("suggest templates: unrelated sections stay below the threshold", () => {
    const root = buildDir({
        "Notes/Misc.md": [
            "# Misc",
            "",
            "## Groceries",
            "- milk",
            "## Receipts",
            "- one",
            "## Photos",
            "- none",
        ].join("\n"),
    });

    const { templates } = recommend(root, "Misc");

    assert.deepEqual(templates, []);
});

test("suggest templates: templates are never applied to the note", () => {
    const root = buildDir({
        "Decisions/Database Choice.md": [
            "# Database Choice",
            "",
            "## Konteks",
            "ctx",
            "## Opsi",
            "opt",
            "## Keputusan",
            "dec",
        ].join("\n"),
    });

    const before = fs.readFileSync(
        path.join(root, "Decisions", "Database Choice.md"),
        "utf8"
    );
    const templates = recommend(root, "Database Choice").templates;
    const after = fs.readFileSync(
        path.join(root, "Decisions", "Database Choice.md"),
        "utf8"
    );

    assert.ok(templates.length > 0);
    assert.equal(before, after);
    assert.ok(!after.includes("{{"));
});

test("suggest templates: unicode template names and paths are supported", () => {
    const templateDir = buildDir(
        {
            "会議 メモ.md": [
                "# {{title}}",
                "",
                "## 概要",
                "{{ai:ringkasan}}",
                "## 決定事項",
                "{{ai:keputusan}}",
            ].join("\n"),
            "plain.md": ["# {{title}}", "", "## Unrelated", "-"].join("\n"),
        },
        "obs-suggest-tpl-"
    );
    const root = buildDir({
        "Notes/Memo.md": [
            "# Memo",
            "",
            "## 概要",
            "abc",
            "## 決定事項",
            "def",
        ].join("\n"),
    });

    const { templates } = recommend(root, "Memo", { templateDir });

    assert.deepEqual(templates.map((item) => item.name), ["会議 メモ"]);
    assert.deepEqual(templates[0].matched, ["概要", "決定事項"]);
    assert.equal(templates[0].score, 1);
});

test("suggest templates: a missing template directory yields no suggestions", () => {
    const root = buildDir({
        "Notes/Memo.md": "# Memo\n\n## 概要\n\nabc\n\n## 決定事項\n\ndef\n",
    });

    const missing = path.join(root, "does-not-exist");
    assert.deepEqual(recommend(root, "Memo", { templateDir: missing }).templates, []);
    assert.deepEqual(loadTemplates(missing), []);
});

test("suggest templates: section names are normalized for comparison", () => {
    const note = {
        name: "Memo",
        relPath: "Notes/Memo.md",
        content: [
            "# Memo",
            "",
            "## *Konteks:*",
            "a",
            "## Opsi",
            "b",
            "## Keputusan",
            "c",
            "## Related",
            "d",
        ].join("\n"),
    };

    const templates = suggestTemplates(note, {
        catalog: loadTemplates(TEMPLATE_DIR),
    });

    const names = templates.map((item) => item.name);
    assert.ok(names.includes("decision"), `expected decision in ${names.join(", ")}`);
    assert.deepEqual(templates[0].matched, ["Konteks", "Opsi", "Keputusan"]);
});

test("suggest templates: a barely overlapping note stays below the threshold", () => {
    const note = {
        name: "Memo",
        relPath: "Notes/Memo.md",
        content: [
            "# Memo",
            "",
            "## Konteks:",
            "a",
            "## Opsi (opsi)",
            "b",
        ].join("\n"),
    };

    assert.deepEqual(
        suggestTemplates(note, { catalog: loadTemplates(TEMPLATE_DIR) }),
        []
    );
});

test("suggest templates: repeated runs and repeated catalog reads are stable", () => {
    const note = {
        name: "Rilis Q3",
        relPath: "Notes/Rilis Q3.md",
        content: [
            "# Rilis Q3",
            "",
            "## Deskripsi",
            "a",
            "## Kriteria Keberhasilan",
            "b",
            "## Desain",
            "c",
            "## Implementasi",
            "d",
            "## Pengujian",
            "e",
            "## Catatan",
            "-",
        ].join("\n"),
    };

    const catalog = getTemplateCatalog(TEMPLATE_DIR);
    const first = suggestTemplates(note, { catalog });
    const second = suggestTemplates(note, { catalog: getTemplateCatalog(TEMPLATE_DIR) });

    assert.deepEqual(first, second);
    assert.equal(first[0].name, "feature");
});

test("template catalog: reads every built-in template with its sections", () => {
    clearTemplateCache();
    const catalog = getTemplateCatalog(TEMPLATE_DIR);
    const templateFiles = fs.readdirSync(TEMPLATE_DIR).filter((file) => file.endsWith(".md"));

    assert.equal(catalog.length, templateFiles.length);
    assert.deepEqual(catalog.map((item) => item.name), loadTemplates(TEMPLATE_DIR).map((i) => i.name));
    for (const template of catalog) {
        assert.ok(template.sections.length >= 2, `${template.name} needs sections`);
        assert.equal(template.sections.length, template.sectionLabels.length);
        assert.ok(!template.sections.includes("{{title}}"), `${template.name} title skipped`);
    }
});

test("structure helpers: normalization, sections, lcs, similarity", () => {
    assert.equal(normalizeHeadingText("  Ringkasan:  "), "ringkasan");
    assert.equal(normalizeHeadingText("*Konteks*"), "konteks");
    assert.equal(normalizeHeadingText("📌 Notes"), "notes");
    assert.equal(normalizeHeadingText("{{title}}"), "");
    assert.equal(normalizeHeadingText("Kesalahan / Bug"), "kesalahan / bug");
    assert.equal(normalizeHeadingText("C++"), "c++");
    assert.equal(normalizeHeadingText("日本語のメモ"), "日本語のメモ");

    assert.deepEqual(
        sectionNames("# Title\n\n## Alpha\n\ntext\n\n### Beta\n\n## alpha\n\n## Gamma\n"),
        ["alpha", "beta", "gamma"]
    );
    assert.deepEqual(sectionNames(""), []);
    assert.deepEqual(sectionNames(null), []);

    assert.equal(lcsLength(["a", "b", "c"], ["a", "c"]), 2);
    assert.equal(lcsLength([], ["a"]), 0);

    const same = structureSimilarity(["a", "b"], ["a", "b"]);
    assert.equal(same.overlap, 2);
    assert.equal(same.score, 1);
    assert.deepEqual(same.matched, ["a", "b"]);

    const partial = structureSimilarity(["a", "b"], ["b", "c"]);
    assert.equal(partial.overlap, 1);
    assert.ok(partial.score > 0 && partial.score < 1);

    assert.equal(structureSimilarity([], ["a"]).score, 0);
    assert.equal(structureSimilarity(["a", "b"], ["a", "b"]).score, 1);
    assert.equal(MIN_TEMPLATE_SECTIONS, 2);
});

// ─── Related Context Helpers ─────────────────────────────────────────

test("related context: dedupe, strong reasons, labels", () => {
    const note = relatedNote("Notes/A.md", []);
    const first = related({ note }, { score: 9 });
    const dup = related({ note }, { score: 4 });

    assert.deepEqual(dedupeRelated([first, dup]), [first]);
    assert.deepEqual(dedupeRelated([null, undefined, { score: 1 }]), []);
    assert.deepEqual(dedupeRelated(null), []);

    assert.equal(isStrongRelationship(first), false);
    assert.equal(isStrongRelationship(related({ note }, { reasons: STRONG })), true);
    assert.equal(
        isStrongRelationship(related({ note }, { reasons: [{ type: "sharedLink", label: "Shared links" }] })),
        true
    );
    assert.equal(isStrongRelationship(null), false);

    assert.deepEqual(reasonLabels(first), ["Shared tags"]);
    assert.deepEqual(
        reasonLabels(
            related({ note }, {
                reasons: [
                    { type: "sharedTag", label: "Shared tags" },
                    { type: "backlink", label: "Backlinks to this note" },
                ],
            })
        ),
        ["Shared tags", "Backlinks to this note"]
    );
    assert.deepEqual(reasonLabels(first, 0), []);
    assert.deepEqual(reasonLabels(null), []);
});

// ─── No Useful Suggestions ───────────────────────────────────────────

test("suggest: an isolated note gets no recommendations at all", () => {
    const root = buildDir({
        "Notes/Lonely.md": "# Lonely\n\nnothing links here\n",
        "Notes/Other.md": "# Other\n\nalso nothing\n",
    });

    const { recommendations } = buildSuggestions(buildVaultIndex(root), "Lonely");

    assert.deepEqual(recommendations, { tags: [], folders: [], templates: [] });
});

test("suggest: an unknown note still returns empty recommendations", () => {
    const root = buildDir({ "Notes/A.md": "# A\n" });
    const result = buildSuggestions(buildVaultIndex(root), "Ghost");

    assert.equal(result.note, null);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.opportunities, []);
    assert.deepEqual(result.recommendations, { tags: [], folders: [], templates: [] });
});

test("suggest: a malformed index entry never throws", () => {
    const index = fakeIndex([
        { name: "Hub", relPath: "Notes/Hub.md", content: "# Hub\n" },
        { name: "Odd", relPath: "Notes/Odd.md", tags: [] },
    ]);

    const result = buildSuggestions(index, "Hub");

    assert.ok(result.note);
    assert.ok(Array.isArray(result.recommendations.tags));
    assert.ok(Array.isArray(result.recommendations.folders));
    assert.ok(Array.isArray(result.recommendations.templates));
});

// ─── Regression: Issues and Opportunities ─────────────────────────────

test("regression: issue types and their order are unchanged", () => {
    const root = buildDir({
        "Notes/Empty.md": "",
        "a/Budget Plan 2026.md": "# Budget Plan 2026\ncontent\n",
        "b/Budget Plan 2025.md": "# Budget Plan 2025\ncontent\n",
        "Notes/Alpha.md": "---\nunclosed frontmatter\n",
    });

    const empty = buildSuggestions(buildVaultIndex(root), "Empty");
    assert.deepEqual(empty.issues.map((i) => i.type), ["empty"]);

    const budget = buildSuggestions(buildVaultIndex(root), "Budget Plan 2026");
    assert.deepEqual(budget.issues.map((i) => i.type), ["similar"]);

    const alpha = buildSuggestions(buildVaultIndex(root), "Alpha");
    assert.deepEqual(alpha.issues.map((i) => i.type), ["frontmatter"]);
});

test("regression: opportunity types and order are unchanged", () => {
    const root = buildDir({
        "Notes/Alpha.md": "# Alpha\n\n- [ ] one\n- [x] two\n",
        "Notes/Beta.md": "# Beta\n\nplain\n",
    });

    const { opportunities } = buildSuggestions(buildVaultIndex(root), "Alpha");

    assert.deepEqual(opportunities.map((o) => o.type), [
        "noTags",
        "noOutgoing",
        "noBacklinks",
        "pendingTasks",
    ]);
    assert.ok(opportunities.find((o) => o.type === "pendingTasks").message.includes("1"));
});

test("regression: stale and large opportunities still fire", () => {
    const root = buildDir({ "Notes/Old.md": "# Old\n\ntext\n" });
    const file = path.join(root, "Notes", "Old.md");
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    fs.utimesSync(file, old, old);

    const { opportunities } = buildSuggestions(buildVaultIndex(root), "Old");

    assert.ok(opportunities.some((o) => o.type === "stale"));
    assert.ok(opportunities.find((o) => o.type === "stale").message.includes("60"));
});

test("regression: link suggestions stay capped at three", () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\n#rust\n",
        "Notes/Alpha.md": "# Alpha\n\n#rust\n",
        "Notes/Beta.md": "# Beta\n\n#rust\n",
        "Notes/Gamma.md": "# Gamma\n\n#rust\n",
        "Notes/Delta.md": "# Delta\n\n#rust\n",
    });

    const links = buildSuggestions(buildVaultIndex(root), "Hub").opportunities.filter(
        (o) => o.type === "link"
    );

    assert.equal(links.length, 3);
    assert.deepEqual(links.map((l) => l.related.name), ["Alpha", "Beta", "Delta"]);
});

test("regression: an already-linked note inside the window is skipped", () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\n#rust\n\n[[Alpha]]\n",
        "Notes/Alpha.md": "# Alpha\n\n#rust\n",
        "Notes/Beta.md": "# Beta\n\n#rust\n",
        "Notes/Gamma.md": "# Gamma\n\n#rust\n",
        "Notes/Delta.md": "# Delta\n\n#rust\n",
    });

    const links = buildSuggestions(buildVaultIndex(root), "Hub").opportunities.filter(
        (o) => o.type === "link"
    );

    // Same behaviour as before the v2 change: only the top
    // MAX_LINK_SUGGESTIONS related notes are considered, so a skipped entry is
    // not back-filled from further down the ranking.
    assert.deepEqual(links.map((l) => l.related.name), ["Beta", "Delta"]);
});

test("regression: notes inside a Related section are not re-linked", () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\n#rust\n\n## Related\n\n- [[Alpha]]\n",
        "Notes/Alpha.md": "# Alpha\n\n#rust\n",
        "Notes/Beta.md": "# Beta\n\n#rust\n",
    });

    const links = buildSuggestions(buildVaultIndex(root), "Hub").opportunities.filter(
        (o) => o.type === "link"
    );

    assert.ok(!links.some((l) => l.message.includes("[[Alpha]]")));
    assert.ok(links.some((l) => l.message.includes("[[Beta]]")));
});

test("regression: body similarity stays disabled inside suggest", () => {
    const body = [
        "Ownership rules explain borrowing across function boundaries clearly.",
        "The borrow checker tracks lifetimes and rejects dangling references.",
        "Interior mutability allows mutation through shared references safely.",
    ].join("\n");

    const root = buildDir({
        "Notes/One.md": `# One\n\n${body}\n`,
        "Notes/Two.md": `# Two\n\n${body}\n`,
    });

    const { opportunities } = buildSuggestions(buildVaultIndex(root), "One");

    assert.deepEqual(opportunities.filter((o) => o.type === "link"), []);
});

test("regression: link suggestions are ordered by relationship score", () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\n#rust\n\n[[Alpha]]\n",
        "Notes/Alpha.md": "# Alpha\n\n#rust\n",
        "Notes/Shared Tags.md": "# Shared Tags\n\n#rust #alpha\n\n[[Hub]]\n",
    });

    const links = buildSuggestions(buildVaultIndex(root), "Hub").opportunities.filter(
        (o) => o.type === "link"
    );

    assert.ok(links.length >= 1);
    assert.ok(links[0].score > 0);
    assert.deepEqual(
        links.map((l) => l.score),
        [...links.map((l) => l.score)].sort((a, b) => b - a)
    );
});

// ─── Regression: CLI Behavior ────────────────────────────────────────

function loadSuggestCommand(aiStub) {
    const aiPath = require.resolve("../utils/ai");
    const original = require(aiPath);

    if (aiStub) {
        require.cache[aiPath].exports = { ...original, generate: aiStub };
    }

    const commandPath = require.resolve("../commands/suggest");
    delete require.cache[commandPath];

    return {
        command: require(commandPath),
        restore() {
            require.cache[aiPath].exports = original;
            delete require.cache[commandPath];
        },
    };
}

test("cli: obs suggest keeps the existing sections and adds recommendations", async () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\n#rust\n\n## Konteks\n\nctx\n\n## Opsi\n\nopt\n\n## Keputusan\n\ndec\n",
        "Projects/A.md": "# A\n\n#rust #cli\n",
        "Projects/B.md": "# B\n\n#rust #cli\n",
    });

    const { command, restore } = loadSuggestCommand();
    let output;

    try {
        output = await withVaultAsync(root, () =>
            captureAsync(() => command("Hub", {}))
        );
    } finally {
        restore();
    }

    assert.ok(output.includes("Suggestions"));
    assert.ok(output.includes("For        : Notes/Hub.md"));
    assert.ok(output.includes("Issues"));
    assert.ok(output.includes("Opportunities"));
    assert.ok(output.includes("Add a link to related note"));
    assert.ok(output.includes("Recommended Tags"));
    assert.ok(output.includes("#cli"));
    assert.ok(output.includes("Recommended Folders"));
    assert.ok(output.includes("Recommended Templates"));
    assert.ok(output.includes("decision"));

    assert.ok(
        output.indexOf("Opportunities") < output.indexOf("Recommended Tags"),
        "recommendations come after opportunities"
    );
});

test("cli: obs suggest prints None. when a note has no recommendations", async () => {
    const root = buildDir({
        "Notes/Lonely.md": "# Lonely\n\ntext\n",
        "Notes/Other.md": "# Other\n\ntext\n",
    });

    const { command, restore } = loadSuggestCommand();
    let output;

    try {
        output = await withVaultAsync(root, () =>
            captureAsync(() => command("Lonely", {}))
        );
    } finally {
        restore();
    }

    assert.equal(output.split("None.").length - 1, 4, "issues + three empty lists");
    assert.ok(output.includes("Recommended Tags"));
    assert.ok(output.includes("Recommended Folders"));
    assert.ok(output.includes("Recommended Templates"));
});

test("cli: obs suggest reports an unknown note without printing sections", async () => {
    const root = buildDir({ "Notes/A.md": "# A\n" });

    const { command, restore } = loadSuggestCommand();
    let output;

    try {
        output = await withVaultAsync(root, () =>
            captureAsync(() => command("Ghost", {}))
        );
    } finally {
        restore();
    }

    assert.ok(output.includes("Note not found: Ghost"));
    assert.ok(!output.includes("Recommended Tags"));
});

test("cli: --ai prints guidance through the existing seam without a provider", async () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\n#rust\n",
        "Projects/A.md": "# A\n\n#rust #cli\n",
        "Projects/B.md": "# B\n\n#rust #cli\n",
    });

    let seenPrompt = null;
    const { command, restore } = loadSuggestCommand(async (prompt) => {
        seenPrompt = prompt;
        return "Pertahankan tiga tag inti.";
    });

    let output;
    try {
        output = await withVaultAsync(root, () =>
            captureAsync(() => command("Hub", { ai: true }))
        );
    } finally {
        restore();
    }

    assert.ok(output.includes("AI Guidance"));
    assert.ok(output.includes("Pertahankan tiga tag inti."));
    assert.ok(seenPrompt.includes("Recommendations (optional, not applied automatically):"));
    assert.ok(seenPrompt.includes("- Tags: #cli"));
    assert.ok(seenPrompt.includes("- Folders: Projects"));
    assert.ok(seenPrompt.includes("JANGAN menyarankan menghapus file"));
});

test("cli: --ai failures stay inside the command", async () => {
    const root = buildDir({ "Notes/A.md": "# A\n" });

    const { command, restore } = loadSuggestCommand(async () => {
        throw new Error("ECONNREFUSED");
    });

    let output;
    try {
        output = await withVaultAsync(root, () =>
            captureAsync(() => command("A", { ai: true }))
        );
    } finally {
        restore();
    }

    assert.ok(output.includes("Ollama belum jalan"));
    assert.ok(output.includes("Issues"));
});

test("cli: buildSuggestPrompt stays backwards compatible without recommendations", () => {
    const { command } = loadSuggestCommand();
    const note = {
        name: "Hub",
        relPath: "Notes/Hub.md",
        tags: ["rust"],
        outgoing: [],
        backlinks: [],
        size: 120,
        content: "# Hub\n\nbody\n",
    };
    const issues = [{ type: "empty", message: "empty" }];
    const opportunities = [{ type: "noTags", message: "no tags" }];

    const legacy = command.buildSuggestPrompt(note, issues, opportunities);
    const enriched = command.buildSuggestPrompt(note, issues, opportunities, {
        tags: [],
        folders: [],
        templates: [],
    });

    assert.ok(!legacy.includes("Recommendations"));
    assert.equal(legacy, enriched, "empty recommendations keep the legacy prompt");
    assert.ok(legacy.includes("Tags: #rust"));
    assert.ok(legacy.includes("Note content excerpt:"));
    assert.ok(legacy.includes("body"));
});

// ─── No Filesystem Mutation ──────────────────────────────────────────

test("no mutation: buildSuggestions and obs suggest leave the vault byte-identical", async () => {
    const root = buildDir({
        "Notes/Hub.md": "# Hub\n\n#rust\n\n## Konteks\n\nctx\n\n## Opsi\n\nopt\n",
        "Projects/ObsKit/A.md": "# A\n\n#rust #cli\n\n[[Hub]]\n",
        "Projects/ObsKit/B.md": "# B\n\n#rust #cli\n",
        "Catatan/🚀 Memo.md": "# Memo\n\n#rust #journal\n",
        "Notes/Empty.md": "",
    });

    const templateHashes = hashTree(TEMPLATE_DIR);
    const before = hashTree(root);
    const statBefore = fs.statSync(path.join(root, "Notes", "Hub.md"));

    const { command, restore } = loadSuggestCommand();
    try {
        withVault(root, () => buildSuggestions(buildVaultIndex(root), "Hub"));
        await withVaultAsync(root, () => captureAsync(() => command("Hub", {})));
        await withVaultAsync(root, () => captureAsync(() => command("Empty", {})));
        await withVaultAsync(root, () => captureAsync(() => command("🚀 Memo", {})));
    } finally {
        restore();
    }

    const after = hashTree(root);
    const statAfter = fs.statSync(path.join(root, "Notes", "Hub.md"));

    assert.deepEqual([...after.entries()], [...before.entries()]);
    assert.equal(after.size, before.size, "no files created or removed");
    assert.deepEqual([...hashTree(TEMPLATE_DIR).entries()], [...templateHashes.entries()]);
    assert.equal(statAfter.mtimeMs, statBefore.mtimeMs, "notes are not rewritten");
    assert.equal(statAfter.size, statBefore.size);
});