# ObsKit v1.6.1 — Template Expansion & Bug Fixes

**Release date:** 2026-09-14
**Type:** Patch release (SemVer-compatible with v1.6.0)

---

## Highlights

- **4 new built-in templates** (15 → 19): `feature`, `experiment`, `retrospective`, `code-review`
- **6 bugs fixed**, including a **`$`-corruption bug** that silently mangled template/AI
  content containing `$` (e.g. `$100`, `$&Sons`)
- **+32 regression tests** — full suite: **468 tests, all passing** (baseline 436)
- Interactive Mode gains a **Create Note from Template** action

---

## Template Additions

| Template | Use for |
|----------|---------|
| `feature` | Feature / improvement tracking (Deskripsi, Kriteria Keberhasilan, Desain, Implementasi, Pengujian) |
| `experiment` | Science/experiment logs (Tujuan, Langkah, Hasil, Analisis, Kesimpulan) |
| `retrospective` | Project or period retrospectives (Yang Berjalan Baik, Yang Perlu Diperbaiki, Pembelajaran, Tindak Lanjut) |
| `code-review` | PR / code review notes (Ringkasan Perubahan, Yang Dilakukan dengan Baik, Saran Perbaikan, Kesalahan/Bug) |

All four follow the existing conventions: standard metadata line, `## Catatan` catch-all,
`{{ai:...}}` placeholders, lowercase names, and hand-fillable custom fields.

## Bug Fixes

| Severity | Bug | Fixed in |
|----------|-----|----------|
| P2 | `$` corruption in `parseTemplate()` (values like `$100` mangled via `String.replace` special patterns) | `utils/markdown.js` |
| P2 | `$` corruption in `fillAIBlocks()` (AI-generated content mangled) | `utils/markdown.js` |
| P2 | `$` corruption in `insertUnderCatatan()`, `replaceSection()`, `fillDailyTemplate()` | `commands/ai.js` |
| P3 | `sanitizeFilename()` kept control chars (NUL, etc.) and trailing dots | `utils/sanitizeFilename.js` |
| P3 | Template-name path traversal (`-t ../name`) read files outside `templates/` | New `isValidTemplateName()` in `utils/markdown.js`, applied in `commands/template.js`, `commands/new.js`, `commands/ai.js` |
| P3 | `obs config` crashed on a malformed `config.json`; `config reset` required config to exist | `commands/config.js` |

The `$` bugs were a **v1.4.5 regression**: `String.replace(regex, string)` treats `$&`,
`$1`, `$$`, … in the replacement string as special patterns. All fixes switch to
**function-callback replacements**, which preserve `$` verbatim.

## Tests

- Baseline: 436 passing → **468 passing** (+32)
- `test/templates.test.js` — all 19 templates verified (section contracts, rendering,
  `obs new -t` integration), Unicode titles, CRLF preservation, `$` regression,
  path-traversal rejection
- `test/sanitizeFilename.test.js` — new dedicated suite (12 cases)
- `test/aiWorkflows.test.js` — `$`-preservation regression tests for the AI daily workflow

## Compatibility

- 100% backward compatible with v1.6.0: no command, utility, output, or `config.json`
  changes; existing notes and templates are untouched. Simply upgrade the package or
  pull the branch and continue using the same workflows.