const fs = require("fs");
const path = require("path");

const { getVaultPath } = require("../utils/vault");
const { walkFiles } = require("../utils/search");
const { error } = require("../utils/feedback");

const AI_SUBCOMMANDS = ["tomorrow", "update", "weekly", "people"];
const SUPPORTED_SHELLS = ["bash", "zsh", "fish", "powershell", "ps1"];
const EXCLUDE_DIRS = [".git", ".obsidian", "node_modules"];

function getCommandNames(program) {
    return program.commands
        .map((command) => command.name())
        .filter((name) => !name.startsWith("__"));
}

function listNotes(root) {
    const vault = root || safeGetVault();
    if (!vault || !fs.existsSync(vault)) return [];

    return walkFiles(vault, { excludeDirs: EXCLUDE_DIRS })
        .filter((file) => file.toLowerCase().endsWith(".md"))
        .map((file) =>
            path
                .relative(vault, file)
                .split(path.sep)
                .join("/")
                .replace(/\.md$/i, "")
        );
}

function safeGetVault() {
    try {
        return getVaultPath();
    } catch {
        return "";
    }
}

function getCandidates(program, line, options = {}) {
    const raw = String(line || "");
    const hasTrailingSpace = /\s$/.test(raw);
    const tokens = raw.split(/\s+/).filter(Boolean);
    const words = hasTrailingSpace ? tokens : tokens.slice(0, -1);
    const current = hasTrailingSpace ? "" : tokens[tokens.length - 1] || "";

    if (words.length === 0) {
        if (current.startsWith("-")) {
            return ["--help", "--version"];
        }
        return getCommandNames(program).filter((name) =>
            name.startsWith(current)
        );
    }

    if (words.length === 1 && words[0] === "ai") {
        return AI_SUBCOMMANDS.filter((name) =>
            name.startsWith(current)
        );
    }

    const notes = options.root ? listNotes(options.root) : listNotes();
    const prefix = current.toLowerCase();

    return notes.filter((note) => {
        const lower = note.toLowerCase();
        return (
            lower.startsWith(prefix) ||
            path.basename(note).toLowerCase().startsWith(prefix)
        );
    });
}

function completeWords(line, program, options = {}) {
    return getCandidates(program, line, options);
}

function renderScript(shell) {
    const s = String(shell || "").toLowerCase();

    switch (s) {
        case "bash":
            return bashScript();
        case "zsh":
            return zshScript();
        case "fish":
            return fishScript();
        case "powershell":
        case "ps1":
            return powershellScript();
        default:
            return null;
    }
}

function bashScript() {
    return `# ObsKit bash completion
# Load with: source <(obsh completion bash)
_obs_complete() {
    local line
    line="\${COMP_WORDS[*]:1}"
    local completions
    completions="\$(obsh __complete "\$line" 2>/dev/null)"
    COMPREPLY=( \$(compgen -W "\$completions" -- "\${COMP_WORDS[COMP_CWORD]}") )
}
complete -o default -F _obs_complete obs
complete -o default -F _obs_complete obsh
complete -o default -F _obs_complete obsidian-helper
`;
}

function zshScript() {
    return `#compdef obs obsh obsidian-helper
# ObsKit zsh completion
# Load with: compdef _obs_complete < <(obsh completion zsh)
_obs_complete() {
    local -a completions
    local line
    line="\${words[2,-1]}"
    completions=("\${(@f)\$(obsh __complete "\$line" 2>/dev/null)}")
    _describe 'obs' completions
}
compdef _obs_complete obs obsh obsidian-helper
`;
}

function fishScript() {
    return `# ObsKit fish completion
# Load with: obsh completion fish | source
function __obs_complete
    set -l line (commandline -opc)
    if test (count $line) -gt 1
        obsh __complete (string join ' ' $line[2..-1]) 2>/dev/null
    else
        obsh __complete "" 2>/dev/null
    end
end
complete -c obs -f -a '(__obs_complete)'
complete -c obsh -f -a '(__obs_complete)'
complete -c obsidian-helper -f -a '(__obs_complete)'
`;
}

function powershellScript() {
    return `# ObsKit PowerShell completion
# Load with: . (obsh completion powershell | Out-String | Invoke-Expression)
Register-ArgumentCompleter -Native -CommandName obs, obsh, obsidian-helper -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $elements = $commandAst.CommandElements | ForEach-Object { $_.ToString() }
    $rest = $elements[1..($elements.Count - 1)] -join ' '
    $candidates = @(& obsh __complete "$rest" 2>$null)
    $candidates | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}
`;
}

function completion(shell) {
    const script = renderScript(shell);

    if (script === null) {
        error(
            `Shell tidak didukung: ${shell} (pilih: ${SUPPORTED_SHELLS.join(", ")})`
        );
        return;
    }

    console.log(script);
}

module.exports = {
    SUPPORTED_SHELLS,
    AI_SUBCOMMANDS,
    getCommandNames,
    listNotes,
    getCandidates,
    completeWords,
    renderScript,
    completion,
};
