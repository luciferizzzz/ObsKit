const fs = require("fs");
const path = require("path");

const { sectionProfile } = require("./structure");

// The catalog is read once per process: `obs suggest` analyses a single note,
// and every lookup in a loop (interactive mode, tests) would otherwise re-read
// and re-parse all 19 templates each time. Keyed by resolved directory so
// tests can point at a temporary template folder.
const catalogCache = new Map();

function templatesDir() {
    return path.join(__dirname, "..", "templates");
}

// Reads template structure only: name plus its ordered section names. Bodies
// are never written anywhere, and nothing outside `dir` is read.
function loadTemplates(dir) {
    const root = dir || templatesDir();

    let files;
    try {
        files = fs.readdirSync(root);
    } catch (err) {
        return [];
    }

    const templates = [];

    for (const file of files) {
        if (!file.endsWith(".md")) {
            continue;
        }

        const fullPath = path.join(root, file);

        let content;
        try {
            content = fs.readFileSync(fullPath, "utf8");
        } catch (err) {
            continue;
        }

        const profile = sectionProfile(content);

        templates.push({
            name: file.slice(0, -".md".length),
            file,
            path: fullPath,
            sections: profile.map((section) => section.name),
            sectionLabels: profile.map((section) => section.text),
        });
    }

    templates.sort((a, b) => a.name.localeCompare(b.name));

    return templates;
}

function getTemplateCatalog(dir) {
    const root = dir || templatesDir();

    let resolved = root;
    try {
        resolved = fs.realpathSync(root);
    } catch (err) {
        // A missing directory is not an error here: the caller simply gets an
        // empty catalog and reports no template suggestions.
        resolved = root;
    }

    if (!catalogCache.has(resolved)) {
        catalogCache.set(resolved, loadTemplates(resolved));
    }

    return catalogCache.get(resolved);
}

function clearTemplateCache() {
    catalogCache.clear();
}

module.exports = {
    templatesDir,
    loadTemplates,
    getTemplateCatalog,
    clearTemplateCache,
};