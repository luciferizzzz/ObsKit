const { scanAllTodos } = require("../checks/todos");
const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { info } = require("../utils/feedback");
const c = require("../utils/colors");

function todo() {
    const todos = scanAllTodos();

    const vault = getVaultPath();
    const files = scanMarkdownFiles(vault);

    if (todos.length === 0) {
        info("No todos found in vault.");
        return;
    }

    const pending = todos.filter((t) => !t.done);
    const completed = todos.filter((t) => t.done);

    console.log(`\n${c.heading("📝 Todo Scanner")}\n`);
    console.log(`${c.title("Total")}     : ${c.value(todos.length)}`);
    console.log(`${c.title("Pending")}   : ${c.value(pending.length)}`);
    console.log(`${c.title("Completed")} : ${c.value(completed.length)}`);
    console.log(`${c.title("Notes")}     : ${c.value(files.length)}`);

    if (pending.length > 0) {
        console.log(`\n${c.heading("Pending")}\n`);

        pending.forEach((t) => {
            console.log(`  ${c.path(t.file)}`);
            console.log(`    ${c.dim("[ ]")} ${t.text}`);
            if (t.tags.length > 0) {
                console.log(`        ${t.tags.map((x) => c.tag(x)).join(" ")}`);
            }
        });
    }

    if (completed.length > 0) {
        console.log(`\n${c.heading("Completed")}\n`);

        completed.forEach((t) => {
            console.log(`  ${c.path(t.file)}`);
            console.log(`    ${c.dim("[x]")} ${t.text}`);
        });
    }
}

module.exports = todo;
