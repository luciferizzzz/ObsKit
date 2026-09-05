# Changelog

All notable changes to **ObsKit** (OBS = Organized Knowledge System) are documented in this file.

The format is inspired by **Keep a Changelog** and follows **Semantic Versioning (SemVer)**.

## [1.6.0] - 2026-09-05

### Automation & Intelligence

#### Added

- `obs doctor` — full vault health analysis:
  - Detects broken links, orphan notes, empty notes, duplicate names, missing tags,
    notes with no outgoing links, and malformed frontmatter
  - Warnings for stale notes (not modified in 30 days) and oversized notes (> 200 KB)
  - Deterministic **Health Score** (0–100) with a documented rating (Excellent / Good / Fair / Needs Attention)
  - `--verbose` shows per-file detail lists
  - `--json` emits a structured machine-readable report
- `obs related <note>` — deterministic related-note discovery ranked by weighted signals
  (backlinks, shared links, shared tags, shared backlinks, title overlap) with `-n, --limit`
- `obs suggest <note>` — actionable recommendations for a single note (issues + opportunities),
  including duplicate/similar-title detection and related-note link suggestions
- `obs review [period]` — periodic vault activity digest (`today`, `week`, `month`,
  or `--days <n>`) covering created/modified notes, pending tasks, relationships,
  broken links, orphan notes created, and most active tags; `--ai` appends an AI summary
- Single-scan shared vault index (`utils/vaultIndex.js`) reused by doctor, related,
  suggest, and review
- Shared tag utilities (`utils/tags.js`) now power `obs tags`, `obs info`, health checks,
  and the new commands

#### Changed

- `obs doctor` output format extended (previously only broken links). Text-mode output is
  human-readable; `--json` is intended for scripting.
- Interactive Mode: new **Intelligence** submenu (Vault Doctor, Related Notes, Suggestions, Review).

#### Notes

- AI enhancement (`suggest --ai`, `review --ai`) is optional and uses a bounded prompt
  (note excerpt ≤ 1200 chars, capped name lists) — never the whole vault.
- Health-score formula is deterministic and documented in docs/ARCHITECTURE.md.

#### Backward Compatible

- All other commands, utilities, and test surfaces keep their previous behavior.
- No configuration changes required.

---

## [Unreleased] — v1.5.7

### Bug Fix

- `obs ai tomorrow` — AI no longer invents extra activities. The prompt now instructs the model to output **exactly** the activities the user entered (no more, no fewer), repeating the name, time, priority, goal, and notes verbatim instead of generating its own schedule (e.g. adding breaks, freelancing, etc.).
- CLI version-assertion tests no longer hardcode a version string; they read the current version from `package.json` so they stop failing on every release.

#### Backward Compatible

- Existing `obs ai tomorrow` checklist format (`# Tomorrow`, `- [ ] HH:MM-HH:MM Nama Kegiatan`) is unchanged.
- All other commands, utilities, and tests keep their previous behavior.

---

## [1.5.6] - 2026-09-03

### Interactive Mode

#### Added

- `obs` (no arguments) now launches an interactive terminal menu
- Main menu with high-level actions: New Note, Today, Find Note, Recent Notes, Random Note, Todo, Dashboard, Vault Stats, People, Relationships, AI, Template
- People submenu: List, Recent, Stats
- Relationships submenu: View, Add, Remove
- AI submenu: Write Note, Tomorrow Plan, Update, Weekly Review, People Note
- Template submenu: List, Preview
- Ctrl+C graceful exit (no stack trace)
- Non-interactive environment detection

#### Changed

- `obs` with no arguments now launches Interactive Mode instead of showing help
- `obs --help` and `obs --version` continue to work normally
- All existing commands remain unaffected

#### Backward Compatible

- All existing commands continue to work identically
- `obs --help` and `obs --version` behavior unchanged
- No configuration changes required

---

## [1.5.5] - 2026-08-26

### Note Inspector

#### Added

- `obs info <note>` — show detailed information about a single note:
  - File metadata (name, vault-relative path, size, created date, modified date)
  - Word count (strips Markdown syntax: headings, bold, italic, code, links, images)
  - Heading outline with full hierarchy (levels 1–6, tree rendering with box-drawing characters)
  - Outgoing wikilinks count
  - Backlinks count
  - Related notes count (from `## Related` section)
  - Tags (code-block-aware, deduplicated)
- Case-insensitive note resolution
- Nested folder resolution
- Unicode, emoji, and spaces in filenames
- CRLF and LF line ending support
- Graceful error handling for missing notes and broken Markdown

### Backward Compatible

- All existing commands, utilities, and tests keep their previous behavior.
- No frozen v1.5.4 surfaces were changed.

---

## [1.5.4] - 2026-08-24

### Tag Explorer

### Added

- Tag lookup by name — `obs tags <tag>` lists every note containing that tag
  (e.g. `obs tags rust`), with vault-relative forward-slash paths sorted
  alphabetically and a `Total Notes` summary.
- Optional `#` prefix — `obs tags rust` and `obs tags #rust` resolve to the
  same tag.
- Exact matching — `#rust` never matches `#rustlang`, `#rust-web`, or nested
  variants; longer and nested tags are found when requested explicitly
  (`rust-web`, `rust/web`).
- Case-insensitive matching — `obs tags #RUST` matches `#rust` and `#Rust`.
- Code block / inline code exclusion — tags inside fenced code blocks and
  inline code are ignored during lookup (reuses the existing `extractTags()`
  behavior).
- Note listing deduplication — a note tagged multiple times is listed once.
- Zero-result handling — unknown tags print `No notes found.` and exit
  normally instead of failing.
- Dedicated test suite (`test/tags.test.js`) covering count-mode compatibility,
  lookup modes, exact/case-insensitive matching, code fences, nested folders,
  Unicode/emoji filenames, spaces in filenames, CRLF/LF content, and
  zero-match behavior.

### Backward Compatible

- `obs tags` without an argument continues to display tag statistics exactly
  as before.
- No other commands, utilities, or frozen v1.5.3 surfaces were changed.

---

## [1.5.3] - 2026-08-23

### Added

- Dashboard Vault Statistics — total notes, people, projects, attachments, and
  markdown files in one view (`obs dashboard`).
- Dashboard Knowledge Statistics — backlinks, orphan notes, relationships,
  tags, related notes (unique `## Related` link targets), and wiki links.
- Dashboard Productivity Statistics — task totals (`- [ ]` / `- [x]`, pending
  vs completed) and the 5 most recent daily notes from the `Daily Notes`
  directory.
- Dashboard Recent Activity — recently modified notes and recently created
  notes (newest first, limited to 5 each) alongside the existing
  notes-modified-today list and 7-day activity chart.
- `relatedNotesCount` in the vault report data (also available via
  `obs report --json`).

### Improved

- Link resolution in the vault report now uses a normalized note-name index
  (`Set` lookups instead of scanning all notes per link).
- Per-file filesystem stats are collected once and reused for the recently
  modified / recently created lists instead of re-statting every file.

### Backward Compatible

- The existing `obs dashboard` sections (notes modified today, 7-day activity,
  recent notes) and `obs report` output keep their previous behavior; new
  statistics are additive.

---

## [1.5.2] - 2026-08-15

### Added

- `obs people list` — display all People notes inside the `People` directory (alphabetical, `•`-bulleted).
- `obs people recent` — display the most recently modified People notes (newest first, default limit 10).
- `obs people stats` — display People note statistics (total note count).
- People management utilities in `utils/people.js`: `getPeopleDirectory()`, `listPeople()`, `recentPeople()`, `peopleStats()`.
- `commands/people.js` with `peopleList()`, `peopleRecentCommand()`, `peopleStatsCommand()`.
- Unit test suite for People management (`test/people-management.test.js`).

### Improved

- `obs ai tomorrow` — replaced the simple 5-question interview with a structured multi-activity planning session. Asks for each activity: name, start time, end time, priority, goal, and notes. Output uses `- [ ]` checklist format with time blocks (e.g. `08:00-09:00 Learn JavaScript`).
- `obs ai --ask --daily` — converted into a structured daily interview. Now asks: most important activity, time, what went well, what didn't go well, learned, improvement, interactions, energy level, and overall feeling.
- `obs ai weekly` — added review categories: Achievements, Productivity, Learning, Relationships, Health, ObsKit Development, and Goals for Next Week. The weekly plan now includes both a retrospective review and a forward-looking weekly schedule.
- `obs ai people <name>` — added a deeper interaction interview. Now asks: when the interaction happened, topics discussed, what was learned, follow-up requirements, and whether the relationship needs more attention. All existing behaviors preserved (preview, confirmation, duplicate prevention, Markdown structure, CRLF preservation).
- AI workflow test suite (`test/aiWorkflows.test.js`) covering tomorrow, daily, weekly, and people prompt builders, section parsing, template filling, and backward compatibility.

### Backward Compatible

- The existing `obs ai people <name>` AI workflow behavior is preserved (preview, confirmation, duplicate prevention, Markdown structure, CRLF handling).
- All existing commands, utilities, and tests keep their previous behavior.
- CRLF line endings are preserved.
- The `## Tomorrow` checklist import in `obs ai update` continues to work unchanged.
- The daily note sections (`Target Hari Ini`, `Catatan`, `Selesai`, `Mood`, `Syukur`, `Refleksi`) are unchanged.

---

## [1.5.1] - 2026-08-14

### Better Templates

- Better placeholders — standardized the metadata line across all 11 built-in templates:
  `**Tanggal:** {{date}} · **Folder:** {{folder}} · **Dibuat:** {{created}} · **Diperbarui:** {{updated}}`,
  with `{{tags}}` / `{{status}}` used consistently where relevant.
- Cleaner layouts — consistent heading hierarchy, spacing, section ordering, and Markdown
  formatting (single `---` after the metadata header, no stray inter-section or trailing rules).
- Improved People template — new sections (`Informasi Dasar`, `Kepribadian`, `Minat`,
  `Fakta Penting`, `Topik Percakapan`, `Hubungan`, `Related`) designed for the
  `obs ai people <name>` workflow, while keeping the code-compatible `## Pertemuan` and
  `## Catatan Interaksi` sections verbatim.
- Better AI compatibility — predictable section names and stable heading structures; all six
  AI daily-workflow sections and the `Jam dibuat` footer token are preserved.
- More consistent formatting — `## Catatan` as the standard catch-all section and
  `**Tags:**` as the standard label.
- Added `{{updated}}` placeholder to `getTemplateData()` (same value as `{{created}}` on
  creation) so templates can express last-updated timestamps.
- Added a template test suite (`test/templates.test.js`) covering rendering, placeholder
  replacement, AI-block extraction/fill, required heading contracts, and `obs today` /
  `obs new -t` / `obs template --list` integration.
- Added a template audit report (`docs/TEMPLATE_AUDIT.md`).

### Backward Compatible

- `obs today`, `obs ai --ask --daily`, `obs ai --daily`, and `obs ai update` continue to use
  the exact daily sections (`Target Hari Ini`, `Catatan`, `Selesai`, `Mood`, `Syukur`,
  `Refleksi`) and the `Jam dibuat` footer token.
- `obs ai people <name>` continues to append to `## Catatan Interaksi`; `obs relate` still
  targets the `## Related` section.
- Custom fields (`{{status}}`, `{{tags}}`, `{{penulis}}`, `{{peserta}}`, `{{mood}}`,
  `{{role}}`, `{{email}}`, `{{telepon}}`, `{{linkedin}}`, …) are unchanged and remain
  fillable by hand.

---

## [1.5.0] - 2026-08-13

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
