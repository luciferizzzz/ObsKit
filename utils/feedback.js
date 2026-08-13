const { default: chalk } = require("chalk");

const SYMBOLS = {
    success: "\u2705 ",
    info: "\u2139\uFE0F  ",
    warning: "\u26A0\uFE0F  ",
    error: "\u274C ",
};

const COLORS = {
    success: chalk.green,
    info: chalk.cyan,
    warning: chalk.yellow,
    error: chalk.red,
};

function print(kind, message) {
    console.log(`${COLORS[kind](SYMBOLS[kind])}${message}`);
}

function success(message) {
    print("success", message);
}

function info(message) {
    print("info", message);
}

function warning(message) {
    print("warning", message);
}

function error(message) {
    print("error", message);
}

module.exports = {
    SYMBOLS,
    success,
    info,
    warning,
    error,
};