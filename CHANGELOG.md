# Changelog

All notable changes to **ObsKit** (OBS = Organized Knowledge System) are documented in this file.

The format is inspired by **Keep a Changelog** and follows **Semantic Versioning (SemVer)**.

## [1.8.0] - 2026-10-22

### Search Foundation v2

v1.8.0 extends the Search Foundation with validated result limits for
`obs find`, corrected content-search match reporting, and a shared search
implementation behind `obs open`. No new dependencies, no changed ranking
formulas, and no changed public exports.

#### Added

- **Result limits for `obs find`** (`-n, --limit <n>`): the number of
  displayed results can be capped. The limit is applied to the order the
  command already displays — filename ranking in default mode, fuzzy score
  in `--fuzzy` mode, and match count in `--content` mode — so the results
  that remain are the top-ranked ones, and `--pick` offers exactly those
  results. Without the flag, all results are shown. Values other than a
  positive integer are rejected with an error instead of being coerced.
- **Optional limit option for the search functions** (`searchFiles`,
  `fuzzySearchFiles`, `searchByContent`): a `limit` option caps the
  returned results after each function's established ordering. Omitting it
  keeps the previous unlimited behavior; invalid values are rejected with
  an error.
- **Optional empty-query matching** (`searchFiles`): a `matchAllWhenEmpty`
  option makes an empty query match every file instead of none. The option
  is opt-in and defaults to off, so the default empty-query behavior of
  every other caller is unchanged.

#### Fixed

- **Content-search match counts** (`searchByContent`): `matches` was
  capped by `maxSnippets`, so a file with more occurrences than snippets
  reported a smaller count than it actually had. `matches` now counts every
  occurrence; `maxSnippets` only caps how many snippets are kept.
- **Content-search line numbers** (`searchByContent`): `line` was
  recomputed while collecting snippets and therefore pointed at the last
  retained snippet. `line`, `snippet`, and `snippets[0]` now all refer to
  the first content match.

#### Changed

- **`obs open` now delegates to the shared search implementation**
  (`searchFiles`): the command's own traversal and matching were replaced
  by the shared one, keeping the same case-insensitive filename matching,
  the same filesystem traversal order, all file types, and hidden folders.
  Displayed relative paths use `/` consistently on every platform, where
  Windows previously showed `\`.
- **`obs open` trims its keyword**: leading and trailing whitespace is
  removed before searching, so `obs open " rust "` searches for `rust`. An
  empty or whitespace-only keyword lists the files returned by the existing
  traversal. An empty keyword already behaved this way; a whitespace-only
  keyword previously matched nothing and now lists the same files.

## [1.7.1] - 2026-10-18

### Search Foundation Hotfix

v1.7.1 is a patch release on top of v1.7.0 that fixes two search
correctness bugs surfaced by the Search Foundation architecture audit:
inconsistent relative-path separators on Windows, and Unicode-unsafe
match offsets in `searchByContent()`. No new features, commands, flags,
dependencies, or result fields.

#### Fixed

- **Forward-slash relative paths in search results** (`searchFiles`,
  `fuzzySearchFiles`, `searchByContent`): `relativePath` was built from a
  raw `path.relative()`, producing `\` on Windows while `list` / `recent` /
  `tags` / `completion` already normalize to `/`. Search results now always
  use `/` on every platform; absolute `path` values remain platform-native.
- **Unicode-safe content-search offsets** (`searchByContent`): match
  indices were taken from a `content.toLowerCase()` copy and used to slice
  the original content. When lowercasing changes string length (e.g. `İ`,
  U+0130, folds to two code units), line numbers and snippets shifted.
  Matching now locates matches against the original text, so line numbers
  and snippets stay correct; matching remains case-insensitive.

## [1.7.0] - 2026-10-14

### Intelligence Workflow

v1.7.0 upgrades the intelligence and AI workflows on top of v1.6.x: deeper
diagnostics, smarter relationships and suggestions, groundable vault context
for the AI, and full AI access inside Interactive Mode.

#### Added

- **Deeper Diagnostics** (`obs doctor` + `obs review`):
  - `obs doctor` gains a **Diagnostics** section and a `diagnostics` array in
    `--json` output (`items` only with `--verbose`). The v1.6.3 `integrity`
    report and the health score are untouched.
  - Three-severity model (`error` / `warning` / `info`) covering 10
    diagnostics: malformed frontmatter, duplicate frontmatter keys, broken
    links, ambiguous link targets, basename collisions, isolated notes, tag
    spelling variants, orphan notes, self links, and single-use tags.
  - `obs review` gains a **Next Actions** section with readiness signals:
    fix malformed metadata, fix broken links, resolve name collisions,
    consolidate tag variants, connect isolated notes, review orphan notes,
    add structure, connect low-density notes, and file unfiled notes.
- **Smart Suggestions v2** (`obs suggest`): a per-note recommendations engine
  that derives structure, folder, tag, and template suggestions from the single
  vault-index scan.
- **Smart Relationships v2** (`obs related`): backlinks resolved by note
  identity (duplicate backlinks and self-references filtered out),
  body-similarity scoring, and human-readable explanations for every ranked
  relationship.
- **AI Vault Context** (`obs ask`): answer questions about the vault with
  grounded context. Retrieval is deterministic and local — Unicode-aware
  tokenization with English/Indonesian stopwords, byte-stable ranking, and a
  raw-substring fallback so CJK questions still match. The prompt is bounded by
  note count, characters per note, and total context size; the exact
  **Sources** are printed; `-n, --limit` (default `5`, max `12`) and
  `-p, --persona` are supported. Nothing relevant → the command reports
  insufficient context and skips the AI.
- **Interactive AI** (`obs` no-argument menu):
  - **AI** submenu gains **Ask Vault** and **Persona** alongside Write Note,
    Tomorrow Plan, Update, Weekly Review, and People Note.
  - **Persona** is chosen for the session and forwarded to every AI action
    (`{ persona: activePersona }`); it is never persisted to configuration.
  - **Suggest** and **Review** confirm AI opt-in per run and forward `{ ai }`
    to the command.
  - Interactive Mode keeps the v1.6.4 cancel-safe / error-safe prompts
    (`promptMenu` / `promptText` / `promptConfirm` / `safeRun`) and the full
    data-driven menu structure (Notes, Browse, Knowledge, Intelligence,
    Relationships, AI, People, Template, Utilities, Config).

#### Changed

- `obs doctor --json` output now includes `diagnostics` alongside the v1.6.x
  `health` and v1.6.3 `integrity` + `filter` sections.
- `obs suggest` output carries the v2 recommendation fields; v1 fields remain
  for script compatibility.
- Interactive Mode forwards the active persona and AI opt-in flags to the
  underlying commands.

#### Fixed

- Backlinks resolve by note identity: one file linked from several places is
  not duplicated, and a note linking itself is filtered out.
- `obs ask` content substring matching is restricted to unspaced scripts
  (CJK), and truncation is reported once the retrieval limit is exceeded.

#### Tests

- Full suite: **720 tests, all passing** over three consecutive runs (v1.6.4
  baseline: 533).

## [1.6.4] - 2026-10-13

### Complete Interactive Mode

The interactive menu (`obs`) now exposes every user-facing command, grouped into
focused submenus so nothing is left to the CLI only.

#### Added

- **Notes** submenu: New Note, Today, Find Note, Rename Note, Move Note, Open
  Note, Note Info (`obs rename`, `obs move`, `obs open`, `obs info`).
- **Browse** submenu: List Notes, Folder Tree, Recent Notes, Random Note, Random
  & Open, Vault Stats, Dashboard, Report (`obs list`, `obs tree`, `obs report`,
  `obs random --open`).
- **Knowledge** submenu: Dead Links, Backlinks, Orphan Notes, Graph, Tags
  (`obs deadlinks`, `obs backlinks`, `obs orphan`, `obs graph`, `obs tags`).
- **Utilities** submenu: Todo List, Attachments, Backup Vault, Archive Notes,
  Cleanup Vault (`obs todo`, `obs attachments`, `obs backup`, `obs archive`,
  `obs cleanup`).
- **Config** submenu: Show Configuration, Set Vault Path, AI Setup, Reset
  Configuration (`obs config`, `obs config set`, `obs config ai`,
  `obs config reset`).
- **Create Note from Template** entry in the Template submenu.

#### Changed

- Interactive Mode main menu reorganised into groups: Notes, Browse, Knowledge,
  Intelligence, Relationships, AI, People, Template, Utilities, Config.
- Cancelling a prompt (Ctrl+C) now returns to the previous menu instead of
  ending the session; a failing command reports the error and returns to the
  menu.
- Menu definitions in `commands/interactive.js` are kept as data and covered by
  `test/interactiveMenu.test.js`.

#### Notes

- Interactive Mode reuses the existing command implementations. No command
  behaviour changed and all non-interactive CLI usage is unaffected.

## [1.6.3] - 2026-10-12

### Vault Integrity & Missing References

A read-only audit release. `obs doctor` now reports vault integrity issues at the
exact location where they occur, without modifying any vault file.

#### Added

- **Vault Integrity report** in `obs doctor`: a unified, read-only section that
  surfaces broken wiki-links, ambiguous references, duplicate basenames, missing
  attachments, and metadata/tag issues, each with source path, line number,
  target, reason, and suggested action.
- `checks/integrity.js` — diagnostic engine built on the existing single-scan
  `buildVaultIndex()` index and `parseWikiLinks()` parser. Diagnostic codes:
  `BROKEN_WIKI_LINK`, `AMBIGUOUS_REFERENCE`, `DUPLICATE_BASENAME`,
  `MISSING_ATTACHMENT`, `MALFORMED_FRONTMATTER`, `DUPLICATE_FRONTMATTER_KEY`,
  `MISSING_REQUIRED_FIELD`, `TAG_SPELLING_VARIANT`, `UNRECOGNIZED_TAG`.
- Exact line/column numbers for link and attachment findings, derived from the
  parser's byte offsets (never guessed).
- Optional, explicit configuration rules (no catalog is assumed by default):
  `integrity.requiredFrontmatter` enables `MISSING_REQUIRED_FIELD`, and
  `integrity.tagCatalog` enables `UNRECOGNIZED_TAG`.
- `obs doctor --note <path>` filters the integrity report to a single note.
- `integrity.summary` and `integrity.diagnostics` are added to `obs doctor --json`.

#### Changed

- `parseWikiLinks()` accepts an opt-in `{ withLines: true }` option; the default
  return shape is unchanged.
- `buildVaultIndex()` now records a line number on each `outgoingDetails` entry.

#### Notes

- This is an audit and reporting release: no automatic link repair, tag
  insertion, note rename/move, or metadata mutation is performed.
- Existing `obs doctor` output and JSON fields are preserved; the integrity
  report is additive.

## [1.6.2] - 2026-10-08

### Template Expansion

#### Added

- `roadmap` — initiative & milestone map per time horizon (Gambaran Umum, Inisiatif
  Utama, Milestone, Risiko & Ketergantungan) with a `{{horizon}}` field
- `troubleshoot` — structured debugging log (Gejala, Dampak, Hipotesis, Langkah
  Diagnosis, Akar Masalah, Perbaikan) with `{{priority}}`
- `checklist` — general-purpose checklist (Tujuan, Item, Verifikasi, Catatan) with
  `{{tipe}}`
- `postmortem` — incident analysis (Ringkasan Insiden, Linimasa, Dampak, Akar
  Masalah, Pencegahan) with `{{status}}`
- `templates/manifest.json` — template manifest with 4 categories (Harian &
  Refleksi, Pengetahuan & Belajar, Produktivitas & Proyek, Kolaborasi & Orang)
  covering all 23 built-in templates; consumed by `obs template --list` for grouped
  output. Custom templates still appear under `Lainnya (custom)`, and a missing or
  unreadable manifest falls back to the previous flat listing.

#### Changed

- `obs template --list` is now grouped by category, with a description per template
  and a usage footer.
- `obs template --preview <name>` now prints a header (Kategori, Deskripsi, Field,
  Blok AI, usage); the preview content itself is unchanged.
- Template skeleton standardized across all 22 non-daily built-in templates: the
  `**Tags:**` metadata line was added to the 16 templates that lacked it, a trailing
  `## Catatan` section was added to `article`/`journal`/`learning`, and whitespace
  plus final newlines were normalized. `daily` intentionally keeps no tags line;
  `idea.md` is the only legacy template left byte-identical.
- Documentation regenerated: template sections in `docs/COMMANDS.md` rewritten,
  `docs/TEMPLATE_GUIDE.md` rebuilt for 23 templates (4-backtick fences fix rendering
  of the `js`/`html`/`css` copies), and the `docs/FAQ.md` template list updated
  11 → 23.

### Tests

- `test/templateCatalog.test.js` (new, 10 tests): manifest↔file bijection, skeleton
  contracts, whitespace/CRLF rules, and CLI output shape.
- Full suite: **484 tests, all passing** (baseline 468 → +16).
- E2E: byte-identical `--list` across runs, 4 previews, path-traversal rejection,
  `obs new -t` for all four new templates (title/date substituted, `{{ai:...}}`
  blocks intact), and `today`/`feature`/`people` regression; SHA-256 of the entire
  `templates/` directory unchanged after every run.

#### Backward Compatible

- The `{{ai:...}}` placeholder system, custom fields, and `obs new` / `obs today` /
  `obs ai` behavior for existing templates are unchanged.
- `obs template --list` still ends with `Lainnya (custom)` when custom templates
  exist; a missing manifest reproduces the previous listing.
- No configuration changes required.

---

## [1.6.1] - 2026-09-14

### Template Expansion

#### Added

- `feature` — feature / improvement tracker (Deskripsi, Kriteria Keberhasilan, Desain,
  Implementasi, Pengujian)
- `experiment` — science/experiment log (Tujuan, Langkah, Hasil, Analisis, Kesimpulan) with
  `{{hipotesis}}` / `{{lingkungan}}` fields
- `retrospective` — project/period retrospective (Yang Berjalan Baik, Yang Perlu Diperbaiki,
  Pembelajaran, Tindak Lanjut)
- `code-review` — pull-request / code review notes (Ringkasan Perubahan, Yang Dilakukan dengan
  Baik, Saran Perbaikan, Kesalahan/Bug)
- Interactive Mode **Template** submenu now offers **Create Note from Template** (folder, title,
  template name) alongside the existing List / Preview actions.

### Bug Fixes

#### Fixed

- **`$` corruption in template rendering** — `parseTemplate()`, `fillAIBlocks()`,
  `insertUnderCatatan()`, `replaceSection()`, and `fillDailyTemplate()` used
  `String.replace()` with string replacements, which treats `$` patterns as special
  placeholders (`$&`, `$1`, `$$`, …). Values containing `$` (e.g. `$100`, `$&Sons`,
  `$5/day`) were silently mangled. All replacements now use function callbacks, so
  `$` is preserved verbatim. (v1.4.5 regression)
- **Filename sanitization gap** — `sanitizeFilename()` now also strips non-whitespace
  control characters (`\x00`–`\x08`, `\x0b`–`\x1f`, `\x7f`) and trims trailing dots in
  addition to the existing illegal-character and whitespace handling, while preserving
  newlines/tabs (allowing label collapse) and Unicode/emoji.
- **Template-name path traversal** — `obs new -t ../name`, `obs template --preview ../name`,
  and `obs ai --template ../name` previously resolved template paths outside `templates/`.
  A shared `isValidTemplateName()` guard now rejects empty names, names over 100 chars,
  and names containing `/`, `\`, `..`, `:`, or NUL, reporting `Template tidak ditemukan.`
- **`obs config` robustness** — `obs config show`/`set`/`ai` crashed with a raw JSON
  error when `config.json` was malformed; `obs config reset` failed when `config.json`
  was missing. Corrupt configs now show a clear recovery message, and `config reset`
  always works.

### Tests

- `test/templates.test.js`: coverage extended to all 19 templates (section contracts,
  rendering, `obs new -t` integration), Unicode titles, CRLF preservation, `$` regression
  cases, and path-traversal rejection.
- `test/sanitizeFilename.test.js` (new): 12 cases — illegal characters, control
  characters, trailing dots, Unicode, emoji, whitespace collapse, `.md` preservation.
- `test/aiWorkflows.test.js`: `$`-preservation regression tests for `fillDailyTemplate()`.
- Full suite: **468 tests, all passing** (baseline 436 → +32).

#### Backward Compatible

- All v1.6.0 commands, utilities, output formats, AI workflows, and existing template
  contents are unchanged.
- The `{{ai:...}}` placeholder system, custom fields, and the shared metadata line are
  unchanged.
- No configuration changes required.

---

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
- Added templates:
  - `research` — research and investigation notes
  - `learning` — learning and study notes
  - `decision` — decision log for tracking important choices
  - `weekly` — weekly review and planning note

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
