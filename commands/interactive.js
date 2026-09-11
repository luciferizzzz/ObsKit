const { select, input } = require("@inquirer/prompts");
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

const VERSION = require("../package.json").version;

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
            if (
                err.name === "ExitPromptError" ||
                err.message === "User force closed the prompt with 0 null"
            ) {
                return;
            }
            throw err;
        }

        if (choice === "exit") return;

        await dispatch(choice);
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
    let folder;
    try {
        folder = (await input({ message: "Folder:" })).trim();
    } catch {
        return;
    }
    if (!folder) return;

    let title;
    try {
        title = (await input({ message: "Judul:" })).trim();
    } catch {
        return;
    }
    if (!title) return;

    newNote(folder, title, {});
}

async function handleFind() {
    let query;
    try {
        query = (await input({ message: "Cari note:" })).trim();
    } catch {
        return;
    }
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
            if (
                err.name === "ExitPromptError" ||
                err.message === "User force closed the prompt with 0 null"
            ) {
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
            if (
                err.name === "ExitPromptError" ||
                err.message === "User force closed the prompt with 0 null"
            ) {
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
    let note;
    try {
        note = (await input({ message: "Nama note:" })).trim();
    } catch {
        return;
    }
    if (!note) return;

    relations(note);
}

async function handleRelate() {
    let note;
    try {
        note = (await input({ message: "Note:" })).trim();
    } catch {
        return;
    }
    if (!note) return;

    let related;
    try {
        related = (await input({ message: "Related note:" })).trim();
    } catch {
        return;
    }
    if (!related) return;

    relate(note, related);
}

async function handleUnrelate() {
    let note;
    try {
        note = (await input({ message: "Note:" })).trim();
    } catch {
        return;
    }
    if (!note) return;

    let related;
    try {
        related = (await input({ message: "Related note:" })).trim();
    } catch {
        return;
    }
    if (!related) return;

    unrelate(note, related);
}

async function aiMenu() {
    while (true) {
        console.log("");
        console.log(c.heading("AI"));
        console.log(c.divider("─────────────────────────────────"));
        console.log("");

        let choice;
        try {
            choice = await select({
                message: "Pilih aksi:",
                choices: [
                    { name: "Write Note", value: "write" },
                    { name: "Tomorrow Plan", value: "tomorrow" },
                    { name: "Update", value: "update" },
                    { name: "Weekly Review", value: "weekly" },
                    { name: "People Note", value: "people" },
                    { name: "Back", value: "back" },
                ],
            });
        } catch (err) {
            if (
                err.name === "ExitPromptError" ||
                err.message === "User force closed the prompt with 0 null"
            ) {
                return;
            }
            throw err;
        }

        if (choice === "back") return;

        switch (choice) {
            case "write":
                await handleAiWrite();
                break;
            case "tomorrow":
                await aiTomorrow({});
                break;
            case "update":
                await aiUpdate({});
                break;
            case "weekly":
                await aiWeekly({});
                break;
            case "people":
                await handleAiPeople();
                break;
        }
    }
}

async function handleAiWrite() {
    let prompt;
    try {
        prompt = (await input({ message: "Prompt:" })).trim();
    } catch {
        return;
    }
    if (!prompt) return;

    await aiWrite(prompt, {});
}

async function handleAiPeople() {
    let name;
    try {
        name = (await input({ message: "Nama orang:" })).trim();
    } catch {
        return;
    }
    if (!name) return;

    await aiPeople(name, {});
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
                    { name: "Back", value: "back" },
                ],
            });
        } catch (err) {
            if (
                err.name === "ExitPromptError" ||
                err.message === "User force closed the prompt with 0 null"
            ) {
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
        }
    }
}

async function handleTemplatePreview() {
    let name;
    try {
        name = (await input({ message: "Nama template:" })).trim();
    } catch {
        return;
    }
    if (!name) return;

    templateAction({ preview: name });
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
            if (
                err.name === "ExitPromptError" ||
                err.message === "User force closed the prompt with 0 null"
            ) {
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
    let note;
    try {
        note = (await input({ message: "Nama note:" })).trim();
    } catch {
        return;
    }
    if (!note) return;

    relatedCmd(note, {});
}

async function handleIntelligenceSuggest() {
    let note;
    try {
        note = (await input({ message: "Nama note:" })).trim();
    } catch {
        return;
    }
    if (!note) return;

    await suggestCmd(note, {});
}

async function handleIntelligenceReview() {
    let period;
    try {
        period = (await input({ message: "Periode (today/week/month):" }))
            .trim() || "week";
    } catch {
        return;
    }

    await reviewCmd(period, {});
}

module.exports = interactive;

async function interactive() {
    try {
        await mainMenu();
    } catch (err) {
        if (
            err.name === "ExitPromptError" ||
            err.message === "User force closed the prompt with 0 null"
        ) {
            return;
        }
        throw err;
    }
}
