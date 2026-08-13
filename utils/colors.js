const { default: chalk } = require("chalk");

const ANSI_RE = /\u001B\[[0-9;]*m/g;

function stripAnsi(text) {
    return String(text).replace(ANSI_RE, "");
}

function heading(text) {
    return chalk.bold.cyan(text);
}

function title(text) {
    return chalk.bold(text);
}

function note(text) {
    return chalk.cyan(text);
}

function path(text) {
    return chalk.cyan(text);
}

function folder(text) {
    return chalk.magenta(text);
}

function value(text) {
    return chalk.bold.yellow(text);
}

function dim(text) {
    return chalk.gray(text);
}

function divider(text) {
    return chalk.gray(text);
}

function tag(text) {
    return chalk.green(text);
}

module.exports = {
    ANSI_RE,
    stripAnsi,
    heading,
    title,
    note,
    path,
    folder,
    value,
    dim,
    divider,
    tag,
};
