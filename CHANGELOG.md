# Changelog

All notable changes to **ObsKit** (OBS = Organized Knowledge System) are documented in this file.

The format is inspired by **Keep a Changelog** and follows **Semantic Versioning (SemVer)**.

---

## [Unreleased]

### Changed

- Rebranded project from Obsidian Helper to ObsKit.
- Introduced the new brand identity:
  OBS = Organized Knowledge System.
- Updated repository branding.
- Updated documentation.
- Updated repository URLs.
- Clarified project independence.
- Clarified compatibility with Obsidian.

### Added

- `obs relate` — add an explicit relationship between two notes.
- `obs unrelate` — remove an explicit relationship between two notes.
- `obs relations` — show related, backlinks, and outgoing links of a note.
- Reusable relationship module (`utils/relationship/`) with parser, validator, scanner, editor, and formatter.
- Unit test suite for the relationship module (`npm test`).
- `obs ai update` now imports the previous daily note's `## Tomorrow` checklist items into today's note under `## Update` (idempotent, preserves checklist state and Markdown formatting).
- Reusable daily workflow module (`utils/dailyWorkflow.js`) with date resolution, daily-note discovery, `## Tomorrow` extraction, checklist parsing/dedup, and `## Update` upsert.
- Unit test suite for the daily workflow module (`npm test`).
- Search foundation (`utils/search.js`) — reusable filename search that powers `obs find` and provides the base for future content search, ranking, filters, and fuzzy search. `obs find` behavior is preserved.
- Unit test suite for the search foundation (`npm test`).
- AI persona foundation (`utils/persona.js`) — reusable persona definitions with `resolvePersona()`, `findPersona()`, `registerPersona()`, and `buildPersonaPrompt()`. All `obs ai` commands accept `-p, --persona <name>`; the Default persona preserves existing behavior.
- Unit test suite for the AI persona foundation (`npm test`).
- `obs ai people <name>` — updates an existing People note's `## Catatan Interaksi` section with AI-structured interaction bullets (preview + confirmation, duplicate prevention, Markdown and CRLF preservation).
- Reusable People-note module (`utils/people.js`) with note discovery, interaction parsing, dedup, and section append.
- Unit test suite for the People workflow (`npm test`).
- Reusable CLI feedback layer (`utils/feedback.js`) — `success()`, `info()`, `warning()`, `error()` using ObsKit-style symbols (✅ ℹ️ ⚠️ ❌) with chalk colors when in a real terminal.
- Unit test suite for the CLI feedback layer (`npm test`).
- Colored output (`utils/colors.js`) across all commands and the relationship formatter — headings, values, paths, folders, tags, and dividers are color-coded (auto-disabled when not a TTY).
- Loading spinner (`utils/spinner.js`) while `obs ai` is generating, and progress bars (`utils/progress.js`) during `obs backup`, `obs archive`, and `obs cleanup`.
- `obs find --fuzzy` — typo-tolerant fuzzy search via `fuzzyScore()` / `fuzzyMatches()` / `fuzzySearchFiles()` / `fuzzySearchNotes()` in `utils/search.js`.
- `obs find --content <query>` — search inside note contents with matching line + snippet (`searchByContent()`).
- `obs find --folder <path>` and `obs find --type <ext>` — scope search to a folder or file extension.
- `obs find --pick` — interactive result selection.
- Result ranking (`rankResults()`): exact matches first, then prefix, substring, and fuzzy.
- `obs completion <shell>` — generate bash/zsh/fish/PowerShell completion scripts for commands, `obs ai` subcommands, and note names (backed by the hidden `obs __complete <line>`).
- `OBSKIT_VAULT` environment variable — overrides the configured vault path (useful for scripting and tests).
- `utils/noteIndex.js` — `buildNormalizedNoteIndex()` and `buildFilePathMap()` for O(1) link and path lookups.
- Command-level integration tests (`test/find.test.js`, `test/commands.test.js`) and CLI smoke tests (`test/cli.test.js`).

### Improved

- Consistent command feedback across the CLI: successes show `✅`, informational/no-result messages show `ℹ️`, warnings/already-existing/no-op states show `⚠️`, and errors/missing resources show `❌`.
- `obs relate` / `obs unrelate` / `obs relations` / `obs backlinks` / `obs rename` / `obs move` now report missing notes as errors (`Note not found: <note>`).
- `obs new`, `obs today`, `obs rename`, `obs move`, `obs init`, `obs open`, `obs config`, `obs report`, and `obs ai` now use consistent success feedback.
- Relationship, AI, and People commands preserve their existing result formatting.
- Errors now show suggestions (`Did you mean …?`) for typos, the help text after missing-argument errors, and are printed in red (`❌`) via commander `configureOutput`.
- `obs --help` now includes a quick-example cheat sheet.
- `checks/deadlinks.js` resolves links case-insensitively and ignores heading fragments (`[[Page#Heading]]`), fixing false "broken link" reports.
- Performance: `obs graph` and `obs orphan` now use `Set`/`Map` indexes instead of O(n²) nested lookups (benchmarked ~40% faster on 400 files / 4000 links).

### Planned

- Interactive Terminal UI (full menu-driven mode)
- Better keyboard-driven navigation
- Relationship suggestions (shared links/tags)
- Watch mode

---

## [1.4.6] - 2026-08-06

### Fixed

- Removed the hardcoded vault path fallback.
- Commands now require an explicitly configured vault.
- Commands no longer crash with `ENOENT` when the vault is missing.
- Missing, invalid, or empty `config.json` shows a clear `Vault is not configured` error.
- Improved vault configuration validation (whitespace-only paths are rejected).
- Improved configuration error messages.

### Changed

- `getVaultPath()` now throws a descriptive error instead of silently falling back to a hardcoded local directory.
- Configuration reads go through the shared `utils/config.js` helper.

### Improved

- Improved cross-platform compatibility (no Windows-specific defaults).
- User-friendly errors replace raw stack traces for expected configuration problems.

---

## [1.4.5] - 2026-08-06

### Fixed

- Added shared filename sanitization utility.
- Fixed invalid filenames when using custom titles (`-t`).
- Removed illegal Windows filename characters.
- Preserved Unicode characters and emoji in filenames.
- Ensured generated notes always use a valid `.md` extension.
- Applied filename sanitization across all note creation commands.

### Improved

- Refactored filename generation into a reusable helper.
- Improved Windows compatibility.
- Improved consistency across commands.

---

## [1.4.4] - 2026-08-06

### Added

- `obs ai tomorrow`
- `obs ai update`
- `obs ai weekly`

### Improved

- AI planning workflow.
- Interactive planning sessions.
- Daily Note updating.
- Weekly planning.

### Fixed

- Trim vault paths during configuration.
- Prevent invalid vault paths caused by leading/trailing spaces.
- Improved vault path validation.

---

## [1.4.3] - 2026-08-05

### Added

#### New Templates

- Meeting
- Project
- Article
- Journal
- Idea
- People

### Improved

- Daily template
- Book template
- HTML template
- CSS template
- JavaScript template

### AI

- Better template compatibility.
- AI-aware placeholders.

---

## [1.4.2] - 2026-08-05

### Added

- Mood section.
- Gratitude section.
- Reflection section.

### Improved

- Better Daily Note generation.
- Auto-create missing sections.
- Improved template filling.

### Fixed

- Daily Note sections were no longer skipped.

---

## [1.4.1] - 2026-08-04

### Added

- Markdown report export.
- HTML report export.
- JSON report export.
- Custom export path.

### Fixed

- Windows CRLF compatibility.
- Improved section matching.
- Better line replacement.

---

## [1.4.0] - 2026-08-04

### Added

- OpenAI provider.
- OpenRouter support.
- OpenAI-compatible APIs.
- `obs config ai`.
- Environment variable support.

### Improved

- Unified AI provider architecture.

---

## [1.3.1] - 2026-08-03

### Fixed

- AI Daily Note parsing.
- Better fallback insertion.
- Improved section detection.

---

## [1.3.0] - 2026-08-03

### Added

- Dashboard.
- Vault Report.
- Todo Scanner.
- Attachment Inspector.
- Backup Vault.
- Archive Notes.
- Cleanup Command.

---

## [1.2.2] - 2026-08-02

### Improved

- Better `--ask` mode.
- Better template insertion.
- Smarter Daily Note updates.

---

## [1.2.1] - 2026-08-02

### Added

- AI Note generation.
- Interactive Daily Journal.
- Direct file writing.
- Daily Note integration.

---

## [1.2.0] - 2026-08-01

### Added

- Backlinks.
- Orphan Notes.
- Graph Analysis.
- Tag extraction.

---

## [1.1.0] - 2026-07-31

### Added

- List Notes.
- Tree View.
- Recent Notes.
- Random Notes.
- Configuration management.

---

## [1.0.0] - 2026-07-30

### Initial Release

#### Note Management

- New Notes
- Daily Notes
- Find Notes
- Rename Notes
- Move Notes
- Open Notes

#### Vault

- Vault Statistics
- Template System
- Dead Link Detection
- Vault Doctor
