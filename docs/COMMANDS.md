# 📖 Command Reference — ObsKit

The complete CLI reference for **ObsKit** (`obs`, OBS = Organized Knowledge System). Every command includes its description, syntax, arguments, options, examples, and notes.

> **Related docs:** [AI.md](AI.md) · [CONFIGURATION.md](CONFIGURATION.md) · [RELATIONSHIPS.md](RELATIONSHIPS.md) · [README.md](../README.md)

---

## 📋 Table of Contents

- [Global](#-global)
- [Configuration](#-configuration)
- [Note Management](#-note-management)
- [Vault Management](#-vault-management)
- [Knowledge Management](#-knowledge-management)
- [AI Commands](#-ai-commands)
- [Utilities](#-utilities)

**Legend**

- `<argument>` — required argument
- `[argument]` — optional argument
- `-o, --option` — command option

**CLI Feedback**

ObsKit uses a small set of consistent symbols for command feedback (colors are shown only in a real terminal):

| Symbol | Meaning |
|--------|---------|
| `✅` | Operation succeeded |
| `ℹ️` | Informational / no results |
| `⚠️` | Warning / already exists / nothing to update |
| `❌` | Error / requested resource not found |

---

## 🌐 Global

```
obs <command> [arguments] [options]
```

| Command | Description |
|---------|-------------|
| `obs --help` | Show help and all commands |
| `obs --version` | Show the current version |

```bash
obs --help
obs --version   # → 1.5.0
```

---

# ⚙️ Configuration

## `obs init`

Set the location of your Obsidian vault.

**Description**

Prompts for an absolute vault path, trims it, rejects empty values, and saves `config.json`.

**Syntax**

```
obs init
```

**Arguments** — none

**Options** — none

**Example**

```bash
obs init
```

```text
? Lokasi Obsidian Vault D:\Vault
✅ Vault berhasil disimpan.
```

**Notes**

- Must be run before most commands.
- The path is stored in `config.json` (project root).

---

## `obs config`

Manage configuration.

**Description**

Shows or modifies configuration via subcommands.

**Syntax**

```
obs config [subcommand]
```

**Subcommands**

| Subcommand | Description |
|------------|-------------|
| *(none)* | Show a summary (vault + active AI provider) |
| `show` | Show full config (API key masked) |
| `set` | Update the vault path interactively |
| `ai` | Interactive AI provider setup |
| `reset` | Reset config to defaults |

**Examples**

```bash
obs config
obs config show
obs config set
obs config ai
obs config reset
```

**Notes**

- `obs config show` masks API keys: `********abcd`.
- `obs config set` rejects paths that do not exist.

---

# 📝 Note Management

## `obs new`

Create a new note.

**Description**

Creates a markdown note, optionally from a template.

**Syntax**

```
obs new <folder> <title> [options]
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<folder>` | Destination folder inside the vault |
| `<title>` | Note title (`.md` added automatically) |

**Options**

| Option | Description |
|--------|-------------|
| `-t, --template <name>` | Create from a template |

**Examples**

```bash
obs new Notes "Learning Rust"
obs new Code "JavaScript Closures" -t js
```

**Notes**

- Title is sanitized: illegal Windows characters (`<>:"/\|?*`) are removed.
- Errors if the file already exists.
- See [TEMPLATE_GUIDE.md](TEMPLATE_GUIDE.md) for templates.

---

## `obs today`

Open or create today's daily note.

**Description**

Looks for `Daily Notes/YYYY-MM-DD.md`; creates it from the `daily` template if missing.

**Syntax**

```
obs today
```

**Arguments** — none

**Options** — none

**Example**

```bash
obs today
```

```text
Tanggal : 2026-08-06
Path : D:\Vault\Daily Notes\2026-08-06.md
Exists : false
✅ Daily note berhasil dibuat!
```

**Notes**

- Prints status without changing an existing daily note.

---

## `obs find`

Search notes by filename keyword.

**Description**

Case-insensitive substring search over all note filenames, ranked by relevance (exact match → prefix → substring). Supports fuzzy, content, folder, extension, and interactive pick modes.

**Syntax**

```
obs find <keywords> [options]
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<keywords>` | Text to match against note filenames |

**Options**

| Option | Description |
|--------|-------------|
| `--fuzzy` | Typo-tolerant fuzzy matching on filenames |
| `--content` | Search inside note contents instead of filenames |
| `--folder <path>` | Restrict search to a specific folder (absolute or vault-relative) |
| `--type <ext>` | Restrict to a file extension (e.g. `md`, `txt`) |
| `--pick` | Select a result interactively with the keyboard |

**Example**

```bash
obs find rust
```

```text
Ditemukan 2 note

📄 Notes/Learning Rust.md
📄 Rust/Cargo.md
```

```bash
obs find "lrning rust" --fuzzy
```

```bash
obs find cargo --content --folder Notes
```

**Notes**

- Default mode matches filenames only (not file contents).
- `--content` searches note contents and shows the matching line and snippet.
- Results are ranked so exact and prefix matches appear first.


---

## `obs rename`

Rename a note.

**Description**

Renames a note inside a folder.

**Syntax**

```
obs rename <folder> <oldName> <newName>
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<folder>` | Folder containing the note |
| `<oldName>` | Current name (without `.md`) |
| `<newName>` | New name (without `.md`) |

**Options** — none

**Example**

```bash
obs rename Code "Old Note" "New Note"
```

```text
✅ Note berhasil diubah.
Code/New Note.md
```

**Notes**

- Errors if the note does not exist or the new name is already used.

---

## `obs move`

Move a note to another folder.

**Description**

Moves a note between folders.

**Syntax**

```
obs move <sourceFolder> <title> <targetFolder>
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<sourceFolder>` | Current folder |
| `<title>` | Note name (without `.md`) |
| `<targetFolder>` | Destination folder |

**Options** — none

**Example**

```bash
obs move Code "JavaScript" Projects
```

```text
✅ Note berhasil dipindahkan.
Code → Projects
```

---

## `obs open`

Open a note.

**Description**

Opens a note in the default application. If multiple notes match, lists them instead.

**Syntax**

```
obs open <keyword>
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<keyword>` | Text to match against note filenames |

**Options** — none

**Example**

```bash
obs open rust
```

```text
✅ Membuka note...
```

```text
Ditemukan beberapa note:
1. Notes/Learning Rust.md
2. Rust/Cargo.md
```

**Notes**

- Uses `start` on Windows.

---

# 📂 Vault Management

## `obs list`

List every note in the vault.

**Description**

Alphabetical list of all markdown notes (hidden folders excluded).

**Syntax**

```
obs list
```

**Arguments** — none

**Options** — none

**Example**

```bash
obs list
```

```text
📚 Notes

Daily Notes/2026-08-06.md
Notes/Learning Rust.md

-----------------------
Total Notes: 42
```

---

## `obs tree`

Display the vault folder tree.

**Description**

Recursive tree view of folders and notes (ignores `.obsidian`, `.git`, `node_modules`).

**Syntax**

```
obs tree
```

**Arguments** — none

**Options** — none

**Example**

```bash
obs tree
```

```text
🌳 Vault Tree

Vault
├── Notes
│   ├── Learning Rust.md
│   └── Markdown Guide.md
└── Projects
    └── Website.md

────────────────────────
Folders : 3
Notes   : 4
```

---

## `obs recent`

Show recently modified notes.

**Description**

Lists notes by modification time, newest first.

**Syntax**

```
obs recent [limit]
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `[limit]` | Number of notes (default `10`) |

**Options** — none

**Example**

```bash
obs recent 5
```

```text
🕒 Recent Notes

1. Notes/Learning Rust.md
   Modified: 2026-08-06 14:32

────────────────────────
Showing 2 of 42 notes.
```

---

## `obs random`

Pick a random note.

**Description**

Selects and optionally opens a random note.

**Syntax**

```
obs random [options]
```

**Arguments** — none

**Options**

| Option | Description |
|--------|-------------|
| `--open` | Open the selected note |

**Example**

```bash
obs random --open
```

```text
🎲 Random Note

Projects/Website.md

Membuka note...
```

---

## `obs stats`

Display vault statistics.

**Description**

Shows total notes, total folders, and per-folder note counts.

**Syntax**

```
obs stats
```

**Arguments** — none

**Options** — none

**Example**

```bash
obs stats
```

```text
📊 Vault Statistics

📄 Total Notes : 42
📁 Total Folder: 8

Folder
📂 Notes             12
📂 Projects          5
```

---

## `obs dashboard`

Show the daily activity dashboard.

**Description**

Today's date, notes modified today, a 7-day activity bar chart, key metrics, and recent notes.

**Syntax**

```
obs dashboard
```

**Arguments** — none

**Options** — none

**Example**

```bash
obs dashboard
```

```text
📊 Dashboard

🗓  Kamis, 6 Agustus 2026
📂 D:\Vault

📝 Notes Modified Today

  • Notes/Learning Rust.md (14:32)

📈 Last 7 Days

  07-31   1  █

⚡ Key Metrics

  Notes       : 42
  Wiki Links  : 156
  Broken Links: 1
  Orphans     : 2
```

---

## `obs report`

Generate a comprehensive vault report.

**Description**

Prints a report or exports it to Markdown / HTML / JSON.

**Syntax**

```
obs report [options]
```

**Arguments** — none

**Options**

| Option | Description |
|--------|-------------|
| `--markdown` | Export as `.md` |
| `--html` | Export as `.html` |
| `--json` | Export as `.json` |
| `-o, --output <path>` | Custom output path (single export) |

**Examples**

```bash
obs report
obs report --markdown
obs report --html --json
obs report --json -o report.json
```

**Notes**

- Exports default to `_exports/` inside the vault (`vault-report-<timestamp>.<ext>`).
- Includes overview, folders, links, orphans, tags, attachments, recent activity, broken links.

---

# 🔗 Knowledge Management

## `obs deadlinks`

Detect broken wiki links.

**Description**

Finds wiki links that point to non-existent notes.

**Syntax**

```
obs deadlinks
```

**Arguments** — none

**Options** — none

**Example**

```bash
obs deadlinks
```

```text
❌ Broken Links

📄 Notes/Learning Rust.md
   → [[Missing Note]]

────────────────────────
Notes Scanned : 42
Links Checked : 156
Broken Links  : 1
```

---

## `obs backlinks`

Find notes that reference a note.

**Description**

Lists every note that links to the given note via `[[note]]`.

**Syntax**

```
obs backlinks <note>
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<note>` | Note name (without `.md`) |

**Options** — none

**Example**

```bash
obs backlinks Rust
```

```text
Backlinks

Notes/Learning Rust.md

-----------------------
Total Backlinks: 1
```

**Notes**

- Errors with `Note not found: <note>` if the note does not exist.

---

## `obs orphan`

Find orphan notes.

**Description**

Lists notes that no other note links to.

**Syntax**

```
obs orphan
```

**Arguments** — none

**Options** — none

**Example**

```bash
obs orphan
```

```text
🌱 Orphan Notes

Notes/Meeting Notes.md

------------------------
Total Orphan Notes: 1
```

---

## `obs graph`

Analyze note relationships.

**Description**

Shows notes, wiki links, broken links, orphans, average links, and most/least linked notes.

**Syntax**

```
obs graph
```

**Arguments** — none

**Options** — none

**Example**

```bash
obs graph
```

```text
📊 Vault Graph

Notes          : 42
Wiki Links     : 156
Broken Links   : 1
Orphan Notes   : 2
Average Links  : 3.71

Most Linked Notes

1. Home (12)
```

---

## `obs tags`

Extract and count tags.

**Description**

Counts `#tag` occurrences across the vault (ignores code blocks).

**Syntax**

```
obs tags
```

**Arguments** — none

**Options** — none

**Example**

```bash
obs tags
```

```text
🏷️  Tags

#javascript (8)
#rust (5)

-----------------------
Total Tags : 16
Unique Tags : 3
```

---

## `obs relate`

Add an explicit relationship between two notes.

**Description**

Adds a `- [[related]]` bullet to the `## Related` section of `<note>`, creating the section when missing. Never duplicates an existing link.

**Syntax**

```
obs relate <note> <related>
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<note>` | Note receiving the relationship (without `.md`) |
| `<related>` | Related note (without `.md`) |

**Options** — none

**Example**

```bash
obs relate Home Rust
```

```text
✅ Related added.
Home → Rust
```

**Notes**

- Both notes must exist in the vault.
- Folders and `.md` suffixes are normalized automatically.
- A note cannot be related to itself.
- Line endings (LF / CRLF) are preserved.
- See [RELATIONSHIPS.md](RELATIONSHIPS.md) for the full relationship guide.

---

## `obs unrelate`

Remove an explicit relationship between two notes.

**Description**

Removes the `- [[related]]` bullet from the `## Related` section of `<note>`. Only lines inside the Related section are touched.

**Syntax**

```
obs unrelate <note> <related>
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<note>` | Note losing the relationship (without `.md`) |
| `<related>` | Related note (without `.md`) |

**Options** — none

**Example**

```bash
obs unrelate Home Rust
```

```text
✅ Related removed.
Home → Rust
```

---

## `obs relations`

Show all relationships of a note.

**Description**

Lists the explicit **Related** links, **Backlinks**, and **Outgoing** links of a note.

**Syntax**

```
obs relations <note>
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<note>` | Note to inspect (without `.md`) |

**Options** — none

**Example**

```bash
obs relations Home
```

```text
🔗 Relations for "Home"

Related
- [[Rust]]

Backlinks
- Index

Outgoing Links
- [[Rust]]

------------------------
Related: 1 · Backlinks: 1 · Outgoing: 1
```

**Notes**

- Errors with `Note not found: <note>` if the note does not exist.

---

## `obs doctor`

Analyze vault health.

**Description**

Vault health summary focused on broken wiki links.

**Syntax**

```
obs doctor
```

**Arguments** — none

**Options** — none

**Example**

```bash
obs doctor
```

```text
 Vault Health Report

Notes : 42
Links : 156
Broken Links : 0

✅ Vault Healthy
```

---

# 🤖 AI Commands

> Full AI documentation: [AI.md](AI.md).

## `obs ai <prompt>`

Generate a note about a prompt.

**Description**

Sends the prompt to the configured AI provider and writes the result as a note.

**Syntax**

```
obs ai <prompt> [options]
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<prompt>` | Topic / instruction for the AI |

**Options**

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --title <title>` | Custom title | `AI Note` |
| `-f, --folder <folder>` | Destination folder | `AI` |
| `--file <path>` | Write to a specific file | — |
| `--daily` | Append to today's daily note | — |
| `--ask` | Interactive question mode | — |
| `--template <name>` | Use a template | — |
| `-p, --persona <name>` | AI persona to use | `default` |

**Example**

```bash
obs ai "Explain JavaScript closures"
```

```text
🧠 AI sedang memproses...

✅ Catatan berhasil dibuat!
📁 D:\Vault\AI\AI Note.md
```

**Notes**

- The command dispatches to dedicated workflows for `tomorrow`, `update`, `weekly`, and `people`.
- Personas control the AI response style (see [AI.md](AI.md) → Personas).

## `obs ai --daily`

Append content to today's daily note under `## Catatan`.

```bash
obs ai "What I learned about markdown" --daily
```

## `obs ai --ask --daily`

Interactive daily journal — 7 questions, 6 filled sections.

```bash
obs ai --ask --daily
```

## `obs ai tomorrow`

Interactive tomorrow-planning session → `Planning/Tomorrow/YYYY-MM-DD.md`.

```bash
obs ai tomorrow
```

## `obs ai update`

Smart daily note update (section by section, preserves content).

Automatically imports the previous daily note's `## Tomorrow` checklist items into today's daily note under `## Update`.

```bash
obs ai update
```

**Tomorrow import**

Before updating, `obs ai update` looks for `Daily Notes/<previous-date>.md` and reads its `## Tomorrow` section:

```markdown
## Tomorrow

- [ ] Finish relationship tests
- [ ] Update documentation
- [ ] Test Windows compatibility
```

The checklist items are carried over into today's daily note:

```markdown
## Update

- [ ] Finish relationship tests
- [ ] Update documentation
- [ ] Test Windows compatibility
```

**Behavior**

- Only `- [ ]` / `- [x]` checklist items are imported — paragraphs, other bullets, and sections after `## Tomorrow` are ignored.
- Checklist state is preserved (`[ ]` stays open, `[x]` stays checked).
- The import is idempotent — running `obs ai update` again never duplicates tasks.
- The tasks are also passed to the AI as context for today's generated content.
- If the previous note is missing, has no `## Tomorrow` section, or the section is empty, `obs ai update` behaves exactly as before (no `## Update` section is created).
- CRLF line endings are preserved.

## `obs ai weekly`

Interactive weekly-planning session → `Planning/Weekly/Week-<n>.md`.

```bash
obs ai weekly
```

## `obs ai people <name>`

Update an existing **People** note with a new AI-structured interaction.

**Description**

Locates the People note for `<name>`, asks for the latest interaction, has the AI structure it as bullets, previews the change, and appends it to the `## Catatan Interaksi` section only after confirmation.

**Syntax**

```
obs ai people <name> [options]
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<name>` | Person name (optional — asked interactively if omitted) |

**Options**

| Option | Description |
|--------|-------------|
| `-p, --persona <name>` | AI persona to use |

**Example**

```bash
obs ai people "John Doe"
```

**Notes**

- Appends bullet points under `## Catatan Interaksi` (created if missing).
- Preserves existing sections, Markdown, and CRLF line endings.
- Skips duplicate interactions (case-insensitive).
- Writes only after explicit confirmation.
- Missing People note → `People note tidak ditemukan: <name>`.

---

# 🧰 Utilities

## `obs backup`

Back up the entire vault to a destination folder.

```bash
obs backup
```

## `obs archive [days]`

Move notes older than `[days]` into an `Archive` folder.

```bash
obs archive 30
```

## `obs cleanup`

Clean the vault (empty files, orphan notes, broken links).

```bash
obs cleanup
```

## `obs todo`

Scan all todo items in the vault.

```bash
obs todo
```

## `obs attachments`

Inspect attachment files in the vault.

```bash
obs attachments
```

## `obs template`

Manage templates.

**Options**

| Option | Description |
|--------|-------------|
| `--list` | List available templates |
| `--preview <name>` | Preview a template's content |

```bash
obs template --list
obs template --preview project
```

**Notes**

- Since **v1.5.1 (Better Templates)** every built-in template uses a standardized metadata
  line (`**Tanggal:** {{date}} · **Folder:** {{folder}} · **Dibuat:** {{created}} ·
  **Diperbarui:** {{updated}}`) and consistent heading structure; the People template gained
  sections for the `obs ai people` workflow.

See [TEMPLATE_GUIDE.md](TEMPLATE_GUIDE.md) for the full template reference.

## `obs completion <shell>`

Generate a shell completion script that completes `obs` commands, `obs ai` subcommands, and note names.

**Arguments**

| Argument | Description |
|----------|-------------|
| `<shell>` | One of: `bash`, `zsh`, `fish`, `powershell` |

**Example**

```bash
obs completion bash        # print the bash completion script
obs completion powershell  # print the PowerShell completion script
```

**Enabling**

```bash
# bash
source <(obs completion bash)

# zsh
obs completion zsh > /tmp/_obs && compdef _obs_complete < /tmp/_obs

# fish
obs completion fish | source

# PowerShell
. (obs completion powershell | Out-String | Invoke-Expression)
```

**Notes**

- The scripts register completion for `obs`, `obsh`, and `obsidian-helper`.
- Completion offers subcommand names first, then note names from the configured vault (hidden folders like `.obsidian` are skipped).

