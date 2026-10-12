const { select, input, confirm } = require("@inquirer/prompts");
const c = require("../utils/colors");

const newNote = require("./new");
const today = require("./today");
const find = require("./find");
const recent = require("./recent");
const random = require("./random");
const todo = require("./todo");
const dashboard = require("./dashboard");
const stats = require("./stats");
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

function isPromptCancel(err) {
    return Boolean(
        err &&
            (err.name === "ExitPromptError" ||
                err.message === "User force closed the prompt with 0 null")
    );
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

// Runs a dispatched command defensively: a failing command (e.g. an
// unconfigured vault) reports the problem and returns to the menu instead of
// ending the interactive session.
async function runCommand(action) {
    try {
        return await action();
    } catch (err) {
        if (isPromptCancel(err)) return undefined;
        error((err && err.message) || "Terjadi kesalahan.");
        return undefined;
    }
}

function printHeader() {
    console.log("");
    console.log(c.heading(`ObsKit v${VERSION}`));
    console.log(c.divider("─────────────────────────────────"));
    console.log("");
}

async function mainMenu() {
    while (true) {
        printHeader();

        let choice;
        try {
            choice = await select({
                message: "Pilih aksi:",
                choices: [
                    { name: "New Note", value: "new" },
                    { name: "Today", value: "today" },
                    { name: "Find Note", value: "find" },
                    { name: "Recent Notes", value: "recent" },
                    { name: "Random Note", value: "random" },
                    { name: "Todo", value: "todo" },
                    { name: "Dashboard", value: "dashboard" },
                    { name: "Vault Stats", value: "stats" },
                    { name: "Intelligence", value: "intel" },
                    { name: "People", value: "people" },
                    { name: "Relationships", value: "relations" },
                    { name: "AI", value: "ai" },
                    { name: "Template", value: "template" },
                    { name: "Exit", value: "exit" },
                ],
            });
        } catch (err) {
            if (isPromptCancel(err)) {
                return;
            }
            throw err;
        }

        if (choice === "exit") return;

        await runCommand(() => dispatch(choice));
    }
}

async function dispatch(choice) {
    switch (choice) {
        case "new":
            await handleNew();
            break;
        case "today":
            today();
            break;
        case "find":
            await handleFind();
            break;
        case "recent":
            recent();
            break;
        case "random":
            random({});
            break;
        case "todo":
            todo();
            break;
        case "dashboard":
            dashboard();
            break;
        case "stats":
            stats();
            break;
        case "intel":
            await intelligenceMenu();
            break;
        case "people":
            await peopleMenu();
            break;
        case "relations":
            await relationsMenu();
            break;
        case "ai":
            await aiMenu();
            break;
        case "template":
            await templateMenu();
            break;
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

async function peopleMenu() {
    while (true) {
        console.log("");
        console.log(c.heading("People"));
        console.log(c.divider("─────────────────────────────────"));
        console.log("");

        let choice;
        try {
            choice = await select({
                message: "Pilih aksi:",
                choices: [
                    { name: "List People", value: "list" },
                    { name: "Recent People", value: "recent" },
                    { name: "People Stats", value: "stats" },
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

        switch (choice) {
            case "list":
                peopleList();
                break;
            case "recent":
                peopleRecentCommand();
                break;
            case "stats":
                peopleStatsCommand();
                break;
        }
    }
}

async function relationsMenu() {
    while (true) {
        console.log("");
        console.log(c.heading("Relationships"));
        console.log(c.divider("─────────────────────────────────"));
        console.log("");

        let choice;
        try {
            choice = await select({
                message: "Pilih aksi:",
                choices: [
                    { name: "View Relations", value: "view" },
                    { name: "Add Relation", value: "add" },
                    { name: "Remove Relation", value: "remove" },
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

        switch (choice) {
            case "view":
                await handleRelations();
                break;
            case "add":
                await handleRelate();
                break;
            case "remove":
                await handleUnrelate();
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

        let choice;
        try {
            choice = await select({
                message: "Pilih aksi:",
                choices: [
                    { name: "Ask Vault", value: "ask" },
                    { name: "Write Note", value: "write" },
                    { name: "Tomorrow Plan", value: "tomorrow" },
                    { name: "Update", value: "update" },
                    { name: "Weekly Review", value: "weekly" },
                    { name: "People Note", value: "people" },
                    { name: "Persona", value: "persona" },
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

        switch (choice) {
            case "ask":
                await handleAiAsk();
                break;
            case "write":
                await handleAiWrite();
                break;
            case "tomorrow":
                await runCommand(() => aiTomorrow({ persona: activePersona }));
                break;
            case "update":
                await runCommand(() => aiUpdate({ persona: activePersona }));
                break;
            case "weekly":
                await runCommand(() => aiWeekly({ persona: activePersona }));
                break;
            case "people":
                await handleAiPeople();
                break;
            case "persona":
                await personaMenu();
                break;
        }
    }
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

    await runCommand(() => askCmd(question, { persona: activePersona }));
}

async function handleAiWrite() {
    const prompt = await promptText("Prompt:");
    if (!prompt) return;

    await runCommand(() => aiWrite(prompt, { persona: activePersona }));
}

async function handleAiPeople() {
    const name = await promptText("Nama orang:");
    if (!name) return;

    await runCommand(() => aiPeople(name, { persona: activePersona }));
}

async function templateMenu() {
    while (true) {
        console.log("");
        console.log(c.heading("Template"));
        console.log(c.divider("─────────────────────────────────"));
        console.log("");

        let choice;
        try {
            choice = await select({
                message: "Pilih aksi:",
                choices: [
                    { name: "List Templates", value: "list" },
                    { name: "Preview Template", value: "preview" },
                    { name: "Create Note from Template", value: "create" },
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

        switch (choice) {
            case "list":
                templateAction({ list: true });
                break;
            case "preview":
                await handleTemplatePreview();
                break;
            case "create":
                await handleTemplateCreate();
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
        console.log("");
        console.log(c.heading("Intelligence"));
        console.log(c.divider("─────────────────────────────────"));
        console.log("");

        let choice;
        try {
            choice = await select({
                message: "Pilih aksi:",
                choices: [
                    { name: "Vault Doctor", value: "doctor" },
                    { name: "Related Notes", value: "related" },
                    { name: "Suggestions", value: "suggest" },
                    { name: "Review", value: "review" },
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

        switch (choice) {
            case "doctor":
                doctor({});
                break;
            case "related":
                await handleIntelligenceRelated();
                break;
            case "suggest":
                await handleIntelligenceSuggest();
                break;
            case "review":
                await handleIntelligenceReview();
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

    await runCommand(() => suggestCmd(note, { ai: useAi }));
}

async function handleIntelligenceReview() {
    const raw = await promptText("Periode (today/week/month):");
    if (raw === null) return;
    const period = raw || "week";

    const useAi = await promptConfirm(
        "Tambahkan AI summary? (butuh provider AI aktif)"
    );
    if (useAi === null) return;

    await runCommand(() => reviewCmd(period, { ai: useAi }));
}

module.exports = interactive;

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
