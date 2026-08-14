function parseTemplate(template, data) {
    let result = template;

    for (const key in data) {
        if (data[key] === undefined || data[key] === null) continue;

        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
        result = result.replace(regex, String(data[key]));
    }

    return result;
}

function extractAIBlocks(template) {
    const blocks = [];
    const regex = /\{\{\s*ai\s*:\s*([^}]+?)\s*\}\}/gi;
    let match;

    while ((match = regex.exec(template)) !== null) {
        blocks.push({
            instruction: match[1].trim(),
            placeholder: match[0],
        });
    }

    return blocks;
}

function fillAIBlocks(template, fills) {
    let result = template;

    for (const { placeholder, content } of fills) {
        const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "g");
        result = result.replace(regex, content || "");
    }

    return result;
}

function getTemplateData(options = {}) {
    const now = new Date();
    const {
        title = "",
        folder = "",
        date = now.toLocaleDateString("id-ID"),
        time = now.toLocaleTimeString("id-ID"),
        datetime = now.toISOString().replace("T", " ").substring(0, 19),
        created = now.toISOString(),
        updated = now.toISOString(),
    } = options;

    return {
        title,
        folder,
        date,
        time,
        datetime,
        created,
        updated,
        day: now.toLocaleDateString("id-ID", { weekday: "long" }),
        month: now.toLocaleDateString("id-ID", { month: "long" }),
        year: now.getFullYear().toString(),
    };
}

module.exports = {
    parseTemplate,
    extractAIBlocks,
    fillAIBlocks,
    getTemplateData,
};