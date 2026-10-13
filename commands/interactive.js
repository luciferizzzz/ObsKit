const { select, input, confirm } = require("@inquirer/prompts");
const c = require("../utils/colors");

const newNote = require("./new");
const today = require("./today");
const find = require("./find");
const renameCmd = require("./rename");
const moveCmd = require("./move");
const openCmd = require("./open");
const infoCmd = require("./info");
const listCmd = require("./list");
const treeCmd = require("./tree");
const recent = require("./recent");
const random = require("./random");
const stats = require("./stats");
const dashboard = require("./dashboard");
const reportCmd = require("./report");
const deadlinks = require("./deadlinks");
const backlinksCmd = require("./backlinks");
const orphan = require("./orphan");
const graph = require("./graph");
const tagsCmd = require("./tags");
const todo = require("./todo");
const attachments = require("./attachments");
const backupCmd = require("./backup");
const archiveCmd = require("./archive");
const cleanupCmd = require("./cleanup");
const configCmd = require("./config");
const { peopleList, peopleRecentCommand, peopleStatsCommand } = require("./people");
const relate = require("./relate");
const unrelate = require("./unrelate");
const relations = require("./relations");
const doctor = require("./doctor");
const relatedCmd = require("./related");
const suggestCmd = require("./suggest");
const reviewCmd = require("./review");
const { aiWrite, aiTomorrow, aiUpdate, aiWeekly, aiPeople } = require("./ai");
const templateAction = require("./template");
const askCmd = require("./ask");
const { getPersonas, findPersona, resolvePersona } = require("../utils/persona");
const { error } = require("../utils/feedback");

const VERSION = require("../package.json").version;

// Session-level persona selection. Kept in memory only — Interactive Mode must
// never persist configuration changes the user did not explicitly ask for.
let activePersona = null;

function setActivePersona(id) {
    activePersona = id || null;
}

function getActivePersona() {
    return activePersona;
}

function resolveActivePersona() {
    return findPersona(activePersona) || resolvePersona();
}

// Menu definitions kept as data so they stay in one place and can be asserted
// by tests. Every user-facing command is reachable from one of these menus.
const MENUS = {
    main: [
        { name: "Notes", value: "notes" },
        { name: "Browse", value: "browse" },
        { name: "Knowledge", value: "knowledge" },
        { name: "Intelligence", value: "intel" },
        { name: "Relationships", value: "relations" },
        { name: "AI", value: "ai" },
        { name: "People", value: "people" },
        { name: "Template", value: "template" },
        { name: "Utilities", value: "utilities" },
        { name: "Config", value: "config" },
        { name: "Exit", value: "exit" },
    ],
    notes: [
        { name: "New Note", value: "new" },
        { name: "Today", value: "today" },
        { name: "Find Note", value: "find" },
        { name: "Rename Note", value: "rename" },
        { name: "Move Note", value: "move" },
        { name: "Open Note", value: "open" },
        { name: "Note Info", value: "info" },
        { name: "Back", value: "back" },
    ],
    browse: [
        { name: "List Notes", value: "list" },
        { name: "Folder Tree", value: "tree" },
        { name: "Recent Notes", value: "recent" },
        { name: "Random Note", value: "random" },
        { name: "Random & Open", value: "randomOpen" },
        { name: "Vault Stats", value: "stats" },
        { name: "Dashboard", value: "dashboard" },
        { name: "Report", value: "report" },
        { name: "Back", value: "back" },
    ],
    knowledge: [
        { name: "Dead Links", value: "deadlinks" },
        { name: "Backlinks", value: "backlinks" },
        { name: "Orphan Notes", value: "orphan" },
        { name: "Graph", value: "graph" },
        { name: "Tags", value: "tags" },
        { name: "Back", value: "back" },
    ],
    utilities: [
        { name: "Todo List", value: "todo" },
        { name: "Attachments", value: "attachments" },
        { name: "Backup Vault", value: "backup" },
        { name: "Archive Notes", value: "archive" },
        { name: "Cleanup Vault", value: "cleanup" },
        { name: "Back", value: "back" },
    ],
    config: [
        { name: "Show Configuration", value: "show" },
        { name: "Set Vault Path", value: "set" },
        { name: "AI Setup", value: "ai" },
        { name: "Reset Configuration", value: "reset" },
        { name: "Back", value: "back" },
    ],
    people: [
        { name: "List People", value: "list" },
        { name: "Recent People", value: "recent" },
        { name: "People Stats", value: "stats" },
        { name: "Back", value: "back" },
    ],
    relations: [
        { name: "View Relations", value: "view" },
        { name: "Add Relation", value: "add" },
        { name: "Remove Relation", value: "remove" },
        { name: "Back", value: "back" },
    ],
    ai: [
        { name: "Ask Vault", value: "ask" },
        { name: "Write Note", value: "write" },
        { name: "Tomorrow Plan", value: "tomorrow" },
        { name: "Update", value: "update" },
        { name: "Weekly Review", value: "weekly" },
        { name: "People Note", value: "people" },
        { name: "Persona", value: "persona" },
        { name: "Back", value: "back" },
    ],
    template: [
        { name: "List Templates", value: "list" },
        { name: "Preview Template", value: "preview" },
        { name: "Create Note from Template", value: "create" },
        { name: "Back", value: "back" },
    ],
    intelligence: [
        { name: "Vault Doctor", value: "doctor" },
        { name: "Related Notes", value: "related" },
        { name: "Suggestions", value: "suggest" },
        { name: "Review", value: "review" },
        { name: "Back", value: "back" },
    ],
};

function isPromptCancel(err) {
    return Boolean(
        err &&
            (err.name === "ExitPromptError" ||
                err.message === "User force closed the prompt with 0 null")
    );
}

function printHeader() {
    console.log("");
    console.log(c.heading(`ObsKit v${VERSION}`));
    console.log(c.divider("─────────────────────────────────"));
    console.log("");
}

// Prints a menu heading and returns the selected value. Returns null when the
// user cancels the prompt (Ctrl+C), so callers can safely go back one level.
async function promptMenu(title, choices) {
    if (title) {
        console.log("");
        console.log(c.heading(title));
        console.log(c.divider("─────────────────────────────────"));
        console.log("");
    }

    try {
        return await select({ message: "Pilih aksi:", choices });
    } catch (err) {
        if (isPromptCancel(err)) return null;
        throw err;
    }
}

async function promptText(message) {
    try {
        return (await input({ message })).trim();
    } catch (err) {
        if (isPromptCancel(err)) return null;
        throw err;
    }
}

async function promptConfirm(message) {
    try {
        return await confirm({ message, default: false });
    } catch (err) {
        if (isPromptCancel(err)) return null;
        throw err;
    }
}

// Runs a dispatched action defensively: a failing command (e.g. an
// unconfigured vault) reports the problem and returns to the menu instead of
// ending the interactive session.
async function safeRun(action) {
    try {
        return await action();
    } catch (err) {
        if (isPromptCancel(err)) return undefined;
        error((err && err.message) || "Terjadi kesalahan.");
        return undefined;
    }
}

async function mainMenu() {
    while (true) {
        printHeader();

        const choice = await promptMenu(null, MENUS.main);

        if (choice === null || choice === "exit") return;

        await safeRun(() => dispatch(choice));
    }
}

async function dispatch(choice) {
    switch (choice) {
        case "notes":
            await notesMenu();
            break;
        case "browse":
            await browseMenu();
            break;
        case "knowledge":
            await knowledgeMenu();
            break;
        case "intel":
            await intelligenceMenu();
            break;
        case "relations":
            await relationsMenu();
            break;
        case "ai":
            await aiMenu();
            break;
        case "people":
            await peopleMenu();
            break;
        case "template":
            await templateMenu();
            break;
        case "utilities":
            await utilitiesMenu();
            break;
        case "config":
            await configMenu();
            break;
    }
}

async function notesMenu() {
    while (true) {
        const choice = await promptMenu("Notes", MENUS.notes);

        if (choice === null || choice === "back") return;

        switch (choice) {
            case "new":
                await safeRun(handleNew);
                break;
            case "today":
                await safeRun(() => today());
                break;
            case "find":
                await safeRun(handleFind);
                break;
            case "rename":
                await safeRun(handleRename);
                break;
            case "move":
                await safeRun(handleMove);
                break;
            case "open":
                await safeRun(handleOpen);
                break;
            case "info":
                await safeRun(handleInfo);
                break;
        }
    }
}

async function browseMenu() {
    while (true) {
        const choice = await promptMenu("Browse", MENUS.browse);

        if (choice === null || choice === "back") return;

        switch (choice) {
            case "list":
                await safeRun(() => listCmd());
                break;
            case "tree":
                await safeRun(() => treeCmd());
                break;
            case "recent":
                await safeRun(() => recent());
                break;
            case "random":
                await safeRun(() => random({}));
                break;
            case "randomOpen":
                await safeRun(() => random({ open: true }));
                break;
            case "stats":
                await safeRun(() => stats());
                break;
            case "dashboard":
                await safeRun(() => dashboard());
                break;
            case "report":
                await safeRun(() => reportCmd({}));
                break;
        }
    }
}

async function knowledgeMenu() {
    while (true) {
        const choice = await promptMenu("Knowledge", MENUS.knowledge);

        if (choice === null || choice === "back") return;

        switch (choice) {
            case "deadlinks":
                await safeRun(() => deadlinks());
                break;
            case "backlinks":
                await safeRun(handleBacklinks);
                break;
            case "orphan":
                await safeRun(() => orphan());
                break;
            case "graph":
                await safeRun(() => graph());
                break;
            case "tags":
                await safeRun(handleTags);
                break;
        }
    }
}

async function utilitiesMenu() {
    while (true) {
        const choice = await promptMenu("Utilities", MENUS.utilities);

        if (choice === null || choice === "back") return;

        switch (choice) {
            case "todo":
                await safeRun(() => todo());
                break;
            case "attachments":
                await safeRun(() => attachments());
                break;
            case "backup":
                await safeRun(() => backupCmd());
                break;
            case "archive":
                await safeRun(() => archiveCmd());
                break;
            case "cleanup":
                await safeRun(() => cleanupCmd());
                break;
        }
    }
}

async function configMenu() {
    while (true) {
        const choice = await promptMenu("Config", MENUS.config);

        if (choice === null || choice === "back") return;

        switch (choice) {
            case "show":
                await safeRun(() => configCmd());
                break;
            case "set":
                await safeRun(() => configCmd("set"));
                break;
            case "ai":
                await safeRun(() => configCmd("ai"));
                break;
            case "reset":
                await safeRun(handleConfigReset);
                break;
        }
    }
}

async function handleNew() {
    const folder = await promptText("Folder:");
    if (!folder) return;

    const title = await promptText("Judul:");
    if (!title) return;

    newNote(folder, title, {});
}

async function handleFind() {
    const query = await promptText("Cari note:");
    if (!query) return;

    await find(query, { pick: true });
}

async function handleRename() {
    const folder = await promptText("Folder (kosongkan untuk root):");
    if (folder === null) return;

    const oldName = await promptText("Nama note saat ini:");
    if (!oldName) return;

    const newName = await promptText("Nama baru:");
    if (!newName) return;

    renameCmd(folder, oldName, newName);
}

async function handleMove() {
    const sourceFolder = await promptText("Folder asal (kosongkan untuk root):");
    if (sourceFolder === null) return;

    const title = await promptText("Judul note:");
    if (!title) return;

    const targetFolder = await promptText("Folder tujuan (kosongkan untuk root):");
    if (targetFolder === null) return;

    moveCmd(sourceFolder, title, targetFolder);
}

async function handleOpen() {
    const keyword = await promptText("Kata kunci note:");
    if (!keyword) return;

    openCmd(keyword);
}

async function handleInfo() {
    const note = await promptText("Nama note:");
    if (!note) return;

    infoCmd(note);
}

async function handleBacklinks() {
    const note = await promptText("Nama note:");
    if (!note) return;

    backlinksCmd(note);
}

async function handleTags() {
    const tag = await promptText("Tag (kosongkan untuk semua tag):");
    if (tag === null) return;

    tagsCmd(tag);
}

async function handleConfigReset() {
    const ok = await promptConfirm("Reset config? Vault path akan dikosongkan.");
    if (!ok) return;

    await configCmd("reset");
}

async function peopleMenu() {
    while (true) {
        const choice = await promptMenu("People", MENUS.people);

        if (choice === null || choice === "back") return;

        switch (choice) {
            case "list":
                await safeRun(() => peopleList());
                break;
            case "recent":
                await safeRun(() => peopleRecentCommand());
                break;
            case "stats":
                await safeRun(() => peopleStatsCommand());
                break;
        }
    }
}

async function relationsMenu() {
    while (true) {
        const choice = await promptMenu("Relationships", MENUS.relations);

        if (choice === null || choice === "back") return;

        switch (choice) {
            case "view":
                await safeRun(handleRelations);
                break;
            case "add":
                await safeRun(handleRelate);
                break;
            case "remove":
                await safeRun(handleUnrelate);
                break;
        }
    }
}

async function handleRelations() {
    const note = await promptText("Nama note:");
    if (!note) return;

    relations(note);
}

async function handleRelate() {
    const note = await promptText("Note:");
    if (!note) return;

    const related = await promptText("Related note:");
    if (!related) return;

    relate(note, related);
}

async function handleUnrelate() {
    const note = await promptText("Note:");
    if (!note) return;

    const related = await promptText("Related note:");
    if (!related) return;

    unrelate(note, related);
}

async function aiMenu() {
    while (true) {
        console.log("");
        console.log(c.heading("AI"));
        console.log(c.divider("─────────────────────────────────"));
        console.log(`  ${c.dim("Persona:")} ${c.title(resolveActivePersona().name)}`);
        console.log("");

        const choice = await promptMenu(null, MENUS.ai);

        if (choice === null || choice === "back") return;

        switch (choice) {
            case "ask":
                await safeRun(handleAiAsk);
                break;
            case "write":
                await safeRun(handleAiWrite);
                break;
            case "tomorrow":
                await safeRun(() => aiTomorrow({ persona: activePersona }));
                break;
            case "update":
                await safeRun(() => aiUpdate({ persona: activePersona }));
                break;
            case "weekly":
                await safeRun(() => aiWeekly({ persona: activePersona }));
                break;
            case "people":
                await safeRun(handleAiPeople);
                break;
            case "persona":
                await personaMenu();
                break;
        }
    }
}

async function handleAiWrite() {
    const prompt = await promptText("Prompt:");
    if (!prompt) return;

    await safeRun(() => aiWrite(prompt, { persona: activePersona }));
}

async function handleAiPeople() {
    const name = await promptText("Nama orang:");
    if (!name) return;

    await safeRun(() => aiPeople(name, { persona: activePersona }));
}

async function personaMenu() {
    const current = resolveActivePersona();

    console.log("");
    console.log(c.heading("Persona"));
    console.log(c.divider("─────────────────────────────────"));
    console.log(`  ${c.dim("Active:")} ${c.title(current.name)}`);
    console.log("");

    let choice;
    try {
        choice = await select({
            message: "Pilih persona:",
            choices: [
                ...getPersonas().map((persona) => ({
                    name: persona.name,
                    value: persona.id,
                    description: persona.description,
                })),
                { name: "Back", value: "back" },
            ],
        });
    } catch (err) {
        if (isPromptCancel(err)) {
            return;
        }
        throw err;
    }

    if (choice === "back") return;

    const selected = findPersona(choice);
    if (!selected) return;

    setActivePersona(selected.id);
}

async function handleAiAsk() {
    const question = await promptText("Pertanyaan:");
    if (!question) return;

    await safeRun(() => askCmd(question, { persona: activePersona }));
}

async function templateMenu() {
    while (true) {
        const choice = await promptMenu("Template", MENUS.template);

        if (choice === null || choice === "back") return;

        switch (choice) {
            case "list":
                await safeRun(() => templateAction({ list: true }));
                break;
            case "preview":
                await safeRun(handleTemplatePreview);
                break;
            case "create":
                await safeRun(handleTemplateCreate);
                break;
        }
    }
}

async function handleTemplatePreview() {
    const name = await promptText("Nama template:");
    if (!name) return;

    templateAction({ preview: name });
}

async function handleTemplateCreate() {
    const folder = await promptText("Folder:");
    if (!folder) return;

    const title = await promptText("Judul:");
    if (!title) return;

    const name = await promptText("Nama template:");
    if (!name) return;

    newNote(folder, title, { template: name });
}

async function intelligenceMenu() {
    while (true) {
        const choice = await promptMenu("Intelligence", MENUS.intelligence);

        if (choice === null || choice === "back") return;

        switch (choice) {
            case "doctor":
                await safeRun(() => doctor({}));
                break;
            case "related":
                await safeRun(handleIntelligenceRelated);
                break;
            case "suggest":
                await safeRun(handleIntelligenceSuggest);
                break;
            case "review":
                await safeRun(handleIntelligenceReview);
                break;
        }
    }
}

async function handleIntelligenceRelated() {
    const note = await promptText("Nama note:");
    if (!note) return;

    relatedCmd(note, {});
}

async function handleIntelligenceSuggest() {
    const note = await promptText("Nama note:");
    if (!note) return;

    const useAi = await promptConfirm(
        "Tambahkan AI guidance? (butuh provider AI aktif)"
    );
    if (useAi === null) return;

    await safeRun(() => suggestCmd(note, { ai: useAi }));
}

async function handleIntelligenceReview() {
    const raw = await promptText("Periode (today/week/month):");
    if (raw === null) return;
    const period = raw || "week";

    const useAi = await promptConfirm(
        "Tambahkan AI summary? (butuh provider AI aktif)"
    );
    if (useAi === null) return;

    await safeRun(() => reviewCmd(period, { ai: useAi }));
}

module.exports = interactive;

// Test-only hook: menu structure exposed so tests can assert completeness.
module.exports._menus = MENUS;

// Exposed for tests: the menu handlers are plain functions that always return
// to the caller (never exit the process), so they can be driven directly.
module.exports.isPromptCancel = isPromptCancel;
module.exports.getActivePersona = getActivePersona;
module.exports.setActivePersona = setActivePersona;
module.exports.resolveActivePersona = resolveActivePersona;
module.exports.aiMenu = aiMenu;
module.exports.personaMenu = personaMenu;
module.exports.handleAiAsk = handleAiAsk;
module.exports.handleIntelligenceSuggest = handleIntelligenceSuggest;
module.exports.handleIntelligenceReview = handleIntelligenceReview;

async function interactive() {
    try {
        await mainMenu();
    } catch (err) {
        if (isPromptCancel(err)) {
            return;
        }
        throw err;
    }
}