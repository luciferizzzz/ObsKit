# 🏗️ Architecture — ObsKit

This document explains how ObsKit (OBS = Organized Knowledge System) works internally: the layered design, CLI flow, command handlers, utilities, checks, markdown processing, the AI pipeline, configuration loading, and design principles.

> **Related docs:** [COMMANDS.md](COMMANDS.md) · [CONFIGURATION.md](CONFIGURATION.md) · [AI.md](AI.md)

---

## 📋 Table of Contents

- [Overall architecture](#-overall-architecture)
- [Layered design](#-layered-design)
- [CLI flow](#-cli-flow)
- [Command handlers](#-command-handlers)
- [Utilities](#-utilities)
- [Checks](#-checks)
- [Vault access](#-vault-access)
- [Markdown processing](#-markdown-processing)
- [AI pipeline](#-ai-pipeline)
- [Configuration loading](#-configuration-loading)
- [Folder structure](#-folder-structure)
- [Design principles](#-design-principles)
- [Future architecture plans](#-future-architecture-plans)

---

## 🏛️ Overall architecture

ObsKit is a **layered CLI** built on plain Node.js (CommonJS) with [Commander](https://github.com/tj/commander.js) for argument parsing and `@inquirer/prompts` for interactive input.

```
┌────────────────────┐
│        CLI         │   bin/obs.js — argument parsing, command registration
└────────┬───────────┘
         ▼
┌────────────────────┐
│      Commands      │   commands/*.js — coordinate one action each
└────────┬───────────┘
         ▼
┌────────────────────┐
│  Checks / Utils    │   checks/*.js (analysis) · utils/*.js (helpers)
└────────┬───────────┘
         ▼
┌────────────────────┐
│       Vault        │   the user's Obsidian folder on disk
└────────────────────┘
```

The **only** dependencies are `commander` and `@inquirer/prompts` — everything else is the standard library.

---

## 🧅 Layered design

The code is split into four layers with strict downward dependencies:

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **CLI** | `bin/obs.js` | Parse args, register commands, dispatch |
| **Commands** | `commands/` | Coordinate one action, print results |
| **Checks** | `checks/` | Analyze the vault, return structured data |
| **Utilities** | `utils/` | Generic helpers, I/O, parsing, AI client |

**Rules**

- Commands never call each other — they only use `checks/` and `utils/`.
- Checks never print — they return data for commands to render.
- The CLI contains no business logic — only routing.
- Shared logic lives in `utils/` or `checks/`, never duplicated in commands.

---

## 🔁 CLI flow

Every invocation of `obs` follows the same path:

```text
user types `obs <command> <args>`
        │
        ▼
bin/obs.js ──► Commander parses argv, validates required arguments
        │
        ▼
command handler runs (commands/<name>.js)
        │
        ▼
utils/ + checks/ resolve vault, scan files, analyze
        │
        ▼
vault on disk ──► read/write notes
        │
        ▼
terminal output
```

The `ai` command dispatches on its first argument:

```text
obs ai tomorrow  ──► aiTomorrow()
obs ai update    ──► aiUpdate()
obs ai weekly    ──► aiWeekly()
obs ai people    ──► aiPeople(name)      (name optional — asked interactively)
obs ai <prompt>  ──► aiWrite(prompt, options)
```

---

## 🎮 Command handlers

Each file in `commands/` implements one CLI command and follows the same lifecycle:

1. **Parse & validate** — Commander enforces required arguments (`<folder>`, `<title>`, …).
2. **Resolve config** — `getVaultPath()` reads `config.json` (throws a friendly error if not configured).
3. **Execute** — perform the action using utils/checks.
4. **Handle errors** — friendly messages, no stack traces.
5. **Report** — print the result and the file path.

**Example — `obs new` lifecycle**

```text
obs new Notes "Learning Rust"
   │  argv: folder=Notes, title="Learning Rust"
   ▼
getVaultPath() ──► config.json ──► vault path (or ❌ "Vault is not configured")
   ▼
sanitizeFilename() + mdFileName() ──► "Learning Rust.md"
   ▼
createFile(<vault path>\Notes\Learning Rust.md, content)   // mkdir -p + write
   ▼
"✅ Note berhasil dibuat!" + path
```

---

## 🧰 Utilities

| Module | Purpose |
|--------|---------|
| `utils/vault.js` | `getVaultPath()` — resolve and trim the vault path |
| `utils/config.js` | `getConfig()` / `saveConfig()` — read/write `config.json` |
| `utils/file.js` | `createFile()` — recursive folder creation, refuses overwrite |
| `utils/scanner.js` | `scanMarkdownFiles()` — recursive `.md` scanner |
| `utils/search.js` | `searchFiles()` / `searchNotes()` — reusable filename search foundation (case-insensitive substring, result objects with `name` / `path` / `relativePath`, optional dir exclusions and extension filters) |
| `utils/noteIndex.js` | `buildNoteIndex()` — `Set` of note names for link analysis |
| `utils/wikilinks.js` | `extractWikiLinks()` — wiki-link parser |
| `utils/markdown.js` | Template parser, AI blocks, template data |
| `utils/dailyWorkflow.js` | Daily-note date/path helpers, `## Tomorrow` extraction, checklist parsing/dedup, `## Update` upsert |
| `utils/sanitizeFilename.js` | `sanitizeFilename()` / `mdFileName()` — safe filenames |
| `utils/ai.js` | Unified AI client (Ollama + OpenAI-compatible) |
| `utils/persona.js` | Reusable AI persona registry — `resolvePersona()`, `findPersona()`, `registerPersona()`, `buildPersonaPrompt()` (see [AI.md](AI.md)) |
| `utils/people.js` | People-note handling for `obs ai people` — note discovery, interaction parsing, dedup, and section append (CRLF-aware) |
| `utils/relationship/` | Relationship module — parser, validator, scanner, editor, formatter (see [RELATIONSHIPS.md](RELATIONSHIPS.md)) |

---

## 🔍 Checks

Checks analyze the vault and **return structured data**. They are the reusable analysis layer used by multiple commands.

### `checks/deadlinks.js`

```js
checkDeadlinks() → { vault, files, totalLinks, broken: [{ file, link }] }
```

Used by `commands/deadlinks.js` and `commands/doctor.js`.

### `checks/vaultReport.js`

```js
collectVaultReport() → {
  vault, noteCount, folderCount, totalSize, totalWords, totalLinks,
  brokenCount, broken, orphanCount, orphans, notesToday, activity,
  recent, mostLinked, tags, folders, attachmentCount, attachmentSize, avgLinks
}
```

A single pass over the vault that powers both `commands/dashboard.js` and `commands/report.js`.

### `checks/todos.js` & `checks/attachments.js`

Todo extraction and attachment inventory, used by `commands/todo.js` and `commands/attachments.js`.

---

## 💾 Vault access

The vault is accessed through `utils/vault.js` and `utils/file.js`:

```text
config.json ──► getVaultPath() ──► vault path (throws if not configured)
                    │
                    ▼
utils/scanner.js scanMarkdownFiles() ──► [ ...full paths to .md files ]
                    │
                    ▼
utils/file.js createFile()  ──► recursive mkdir + write (never overwrites)
```

Command-specific filters are applied on top of the scanner output:

- `obs list` filters hidden paths (`.obsidian`, `.git`).
- `obs tree` ignores `.obsidian`, `.git`, `node_modules`.
- `obs stats` counts folders and per-folder note counts.

**Search foundation** — `utils/search.js` powers `obs find` and is the reusable base for future search features (content search, ranking, optional filters, fuzzy search). It walks the vault, matches filenames case-insensitively, and returns result objects with `name`, absolute `path`, and vault-relative `relativePath`. Options support extension filters (`searchNotes`) and directory exclusion. Default behavior matches the original `obs find` exactly (all file types, no hidden-dir exclusion).

---

## 📝 Markdown processing

The project uses small, purpose-built parsers rather than a full markdown engine.

### Wiki links (`utils/wikilinks.js`)

```text
[[Page]]                → Page
[[Folder/Page]]         → Page        (folder stripped)
[[Page|Alias]]          → Page        (alias stripped)
[[Page#Heading]]        → Page#Heading
[[image.png]]           → skipped     (attachments ignored)
```

`extractWikiLinks()` is a thin compatibility layer over the relationship parser — both return identical output.

### Wiki links — relationship parser (`utils/relationship/parser.js`)

The structured parser used by the relationship module:

```text
[[Page]]                → { target: "Page", alias: null,  heading: null }
[[Page|Alias]]          → { target: "Page", alias: "Alias", heading: null }
[[Page#Heading]]        → { target: "Page", alias: null,  heading: "Heading" }
[[Folder/Page]]         → { target: "Page", ... }          (folder stripped)
[[image.png]]           → skipped                          (attachments ignored)
```

See [RELATIONSHIPS.md](RELATIONSHIPS.md) for the full relationship module reference.

### Template placeholders (`utils/markdown.js`)

```text
{{title}}               → data placeholder (getTemplateData)
{{ai:<instruction>}}    → AI block (extractAIBlocks / fillAIBlocks)
```

### Daily-note sections (`commands/ai.js`)

`parseSections()` splits AI output into the six daily sections (`Target Hari Ini`, `Catatan`, `Selesai`, `Mood`, `Syukur`, `Refleksi`) using tolerant heading matching. `fillDailyTemplate()` and `insertUnderCatatan()` merge content into existing notes.

### Daily workflow (`utils/dailyWorkflow.js`)

`obs ai update` reuses this module to import the previous daily note's `## Tomorrow` checklist items into today's note under `## Update`. It owns date resolution, daily-note path discovery, section extraction, checklist parsing, duplicate detection, and the `## Update` upsert. Section extraction reuses `getSectionContent()` from the relationship parser; newline handling reuses `detectNewline()` from the relationship editor.

---

## 🤖 AI pipeline

`utils/ai.js` is the single interface between commands and the LLM.

```text
commands/ai.js ──► utils/persona.js resolvePersona(name) ──► persona.system
                    │
                    ▼
                  utils/ai.js generate(prompt)
                        │
                        ├── provider === "ollama" ──► POST {url}/api/generate     (stream)
                        │
                        └── provider === "openai" ──► POST {baseUrl}/chat/completions (stream)
```

Every AI command resolves a persona first (`resolvePersona(options.persona)`, defaulting to the **Default** persona) and uses `persona.system` as the system prompt. Persona logic is completely separate from the provider client — adding a persona never touches `utils/ai.js`.

**Pipeline for `obs ai --ask --daily`**

```text
askUser() ──► 7 answers
   ▼
buildPromptFromAnswers() ──► prompt
   ▼
utils/ai.js generate(prompt) ──► streamed markdown
   ▼
parseSections() ──► 6 sections
   ▼
fillDailyTemplate(existing, sections)  or  createFile(new daily note)
```

**Abstraction points**

- `getProvider()` reads the `ai` section of `config.json`.
- Both providers stream responses with a **5-minute timeout** (`AbortController`).
- Errors are normalized into friendly messages.
- Defaults: Ollama `http://127.0.0.1:11434` / `qwen2.5-coder:7b`; OpenAI `https://api.openai.com/v1` / `gpt-4o-mini`.

See [AI.md](AI.md) for the full AI system documentation.

---

## ⚙️ Configuration loading

Configuration is a single `config.json` in the project root.

```text
config.json
{
  "vault": "D:\\Vault",
  "ai": {
    "provider": "ollama",
    "ollama":  { "url", "model" },
    "openai":  { "apiKey", "model", "baseUrl" }
  }
}
```

| Module | Role |
|--------|------|
| `utils/config.js` | Generic `getConfig()` / `saveConfig()` |
| `commands/init.js` | First-time vault setup |
| `commands/config.js` | Subcommands: `show` (masks keys), `set`, `ai`, `reset` |
| `utils/vault.js` | Vault-path resolution (trims whitespace) |
| `utils/ai.js` | Reads `ai` section, falls back to `OPENAI_API_KEY` |

See [CONFIGURATION.md](CONFIGURATION.md) for details.

---

## 🌳 Folder structure

```text
obskit/
├── bin/
│   └── obs.js               # CLI entry point
├── commands/                # one module per command
│   ├── ai.js                # AI writer + productivity commands
│   ├── config.js            # config subcommands
│   ├── init.js              # vault setup
│   ├── new.js / today.js / find.js / rename.js / move.js / open.js
│   ├── list.js / tree.js / recent.js / random.js / stats.js
│   ├── dashboard.js / report.js
│   ├── deadlinks.js / backlinks.js / orphan.js / graph.js / tags.js / doctor.js
│   ├── archive.js / attachments.js / backup.js / cleanup.js / todo.js
│   ├── relate.js / unrelate.js / relations.js
│   └── template.js
├── checks/                  # reusable analysis
│   ├── deadlinks.js
│   ├── vaultReport.js
│   ├── todos.js
│   └── attachments.js
├── utils/                   # shared helpers
│   ├── ai.js  config.js  file.js  markdown.js
│   ├── noteIndex.js  persona.js  sanitizeFilename.js  scanner.js  search.js  vault.js  wikilinks.js
│   ├── people.js
│   └── relationship/        # relationship module (parser, validator, scanner, editor, formatter, index)
├── templates/               # note templates
├── test/                    # unit tests (node:test)
├── docs/                    # documentation
├── config-example.json
├── config.json
├── obs.bat                  # Windows launcher
└── package.json
```

---

## 🧭 Design principles

- **Simple beats clever** — small, readable commands over abstractions.
- **Reuse over duplicate** — shared logic lives in `utils/` and `checks/`.
- **Thin CLI** — `bin/obs.js` only routes.
- **Checks return, commands print** — separation of analysis from presentation.
- **Safe by default** — never overwrite notes; validate before writing.
- **Cross-platform** — `path.join`, `path.sep`, CRLF-aware parsing, `sanitizeFilename`.
- **Friendly errors** — user-facing messages, not stack traces.
- **Lightweight** — minimal dependencies.

---

## 🔭 Future architecture plans

See [ROADMAP.md](ROADMAP.md) for the full roadmap. Highlights:

- **v1.5–v1.7** — interactive TUI, relationship commands, autocomplete, fuzzy search, watch mode.
- **v2.0–v2.1** — multi-vault, workspace profiles, git integration, automation, REST API.
- **v3.0** — web dashboard, cloud backup, plugin marketplace, AI ecosystem, **MCP server**.
