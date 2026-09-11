function stripCodeBlocks(content) {
    let result = content.replace(/```[\s\S]*?```/g, "");
    result = result.replace(/`[^`\n]+`/g, "");
    return result;
}

function extractTags(content) {
    const cleaned = stripCodeBlocks(content);
    const regex = /(?:^|\s)#([a-zA-Z0-9_/][a-zA-Z0-9_\-/]*)/g;
    const tags = [];
    let match;

    while ((match = regex.exec(cleaned)) !== null) {
        tags.push("#" + match[1]);
    }

    return tags;
}

module.exports = {
    stripCodeBlocks,
    extractTags,
};