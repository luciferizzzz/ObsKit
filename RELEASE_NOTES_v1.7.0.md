# ObsKit v1.7.0 — Intelligence Workflow

**Release date:** _unreleased_ (feature branch `feature/intelligence-workflow-v1.7.0`)
**Type:** Feature release (SemVer-compatible with v1.6.4)

---

## Highlights

- **Deeper Diagnostics** — `obs doctor` gains a `Diagnostics` section and a
  `diagnostics` array in `--json` (items with `--verbose`); `obs review` gains a
  **Next Actions** section. Ten diagnostic codes across `error` / `warning` /
  `info`, plus nine readiness signals. The v1.6.x health score and the v1.6.3
  integrity report are untouched.
- **Smart Relationships v2** — backlinks are resolved by note identity
  (duplicates and self-references filtered), relationships are ranked with
  body-similarity scoring, and every match now carries a human-readable
  explanation.
- **Smart Suggestions v2** — `obs suggest` derives per-note **structure,
  folder, tag, and template** recommendations from the same single vault-index
  scan the command already performs.
- **AI Vault Context (`obs ask`)** — ask questions about the vault and get
  grounded answers. Retrieval is deterministic and local (no network call until
  the final AI request), prompt size is bounded, exact **Sources** are printed,
  and the AI is skipped entirely when nothing relevant is found.
- **Interactive AI** — the Interactive Mode **AI** submenu now includes
  **Ask Vault** and **Persona**; **Suggest** and **Review** confirm AI opt-in
  per run; every AI action forwards the session persona. All v1.6.4 menus,
  cancel-safe and error-safe prompts are preserved.
- **+187 focused tests** — full suite: **720 tests, all passing** over three
  consecutive runs (v1.6.4 baseline: 533).
- **No new runtime dependency.** Retrieval, diagnostics, recommendations, and
  similarity are pure in-memory passes over the existing vault index; the AI
  call reuses the existing `utils/ai.js` client.

---

## What's new

### Deeper Diagnostics (`obs doctor`, `obs review`)

`collectDiagnostics(index, { health })` runs in the same `buildVaultIndex()`
scan and never changes the health score, the issue/warning counters, or any
pre-v1.7 output section.

| Code | Severity | Detects |
|------|----------|---------|
| `METADATA_MALFORMED_FRONTMATTER` | error | `---` opened but never closed |
| `METADATA_DUPLICATE_KEY` | warning | repeated top-level frontmatter key |
| `RELATIONSHIP_BROKEN_LINK` | warning | wiki-link target no note resolves to |
| `RELATIONSHIP_AMBIGUOUS_TARGET` | warning | link to a basename shared by several notes |
| `NOTE_BASENAME_COLLISION` | warning | same basename in different folders |
| `NOTE_ISOLATED` | warning | no incoming links, no outgoing links, no tags |
| `TAG_SPELLING_VARIANT` | warning | one tag written several ways |
| `NOTE_ORPHAN` | info | no incoming links |
| `RELATIONSHIP_SELF_LINK` | info | plain wiki-link to the containing note |
| `TAG_SINGLE_USE` | info | tag used by exactly one note |

`obs review` reuses those findings and adds readiness signals (it answers
"what should I work on next" while doctor answers "what is wrong"):
`FIX_MALFORMED_METADATA`, `FIX_BROKEN_LINKS`, `RESOLVE_NAME_COLLISIONS`,
`CONSOLIDATE_TAG_VARIANTS`, `CONNECT_ISOLATED_NOTES`, `REVIEW_ORPHAN_NOTES`,
plus locally computed `ADD_STRUCTURE`, `CONNECT_LOW_DENSITY_NOTES`, and
`FILE_UNFILED_NOTES`.

Everything sorts stably (severity rank, then code; item lists code-unit
sorted), so output is byte-identical across machines.

### Smart Relationships v2 (`obs related`)

- Backlinks are resolved by **note identity**, so one file linked from several
  places is never duplicated and a note linking itself is filtered out.
- Relationships are scored with **body similarity** on top of the link graph,
  and every ranked match includes an **explanation** of why it is related.

### Smart Suggestions v2 (`obs suggest`)

`buildSuggestions(index, targetRef, options)` now returns `recommendations`
alongside the v1.x `issues` and `opportunities`: structural suggestions,
folder placement, tag alignment, and template suggestions are derived from the
vault index (see `checks/suggestFolders.js`, `checks/suggestTags.js`,
`checks/suggestTemplates.js`, `utils/structure.js`, `utils/folders.js`,
`utils/templates.js`). v1 fields remain for script compatibility.

### AI Vault Context (`obs ask`)

```bash
obs ask "bagaimana cara kerja rust ownership"
```

- Deterministic, local retrieval: Unicode-aware tokenization with English and
  Indonesian stopwords, ranking (title phrase +8, title term +5, tag match +4,
  body term +2), byte-stable tie-breaking, and a raw-substring fallback so CJK
  questions still match.
- Prompt bounded by note count, characters per note, and total context size;
  densest matching window extracted per note; `truncated` is flagged when only
  a subset of relevant notes is included.
- **Sources** list prints the exact paths used.
- Options: `-n, --limit <n>` (default `5`, max `12`), `-p, --persona <name>`.
- No relevant note → the command reports insufficient context and skips the AI.
- OpenAI requires an API key; the key is never printed.

### Interactive AI (`obs` with no arguments)

- **AI** submenu: Write Note, Tomorrow Plan, Update, Weekly Review, People
  Note, **Ask Vault**, **Persona**.
- **Persona** selects the session persona (AI → Persona) and every AI action
  forwards `{ persona: activePersona }`; never persisted to configuration.
- **Suggest** (Intelligence → Suggestions) and **Review** (Intelligence →
  Review) confirm AI opt-in per run (`Tambahkan AI summary? …`) and forward
  `{ ai: useAi }` to the command.
- Cancel-safe (`promptMenu` / `promptText` / `promptConfirm`) and error-safe
  (`safeRun`) behaviour from v1.6.4 is preserved; Ctrl+C returns one level and
  a failing command reports and returns to the menu.

### CLI impact

Additive. `obs ask`, the diagnostics/review signals, the v2 relationship and
suggestion fields, and the `--persona` / `--ai` forwarding are new; every
existing command, flag, and output section behaves as before. Interactive Mode
still calls the same `commands/*` modules as the CLI.

---

## Implementation notes

- Diagnostics (`checks/diagnostics.js`), review signals (`checks/review.js`),
  retrieval (`checks/context.js`), recommendations
  (`checks/suggestFolders.js`, `checks/suggestTags.js`,
  `checks/suggestTemplates.js`), and similarity
  (`utils/relationship/similarity.js`) are each one O(n + links) in-memory pass
  over the single `buildVaultIndex()` scan. No extra filesystem reads, no N²
  scans, no new dependencies.
- `commands/ask.js` dispatches through `retrieveContext` → `buildContext` →
  `utils/ai.js` + `resolvePersona()`; nothing is read from disk during
  retrieval and no network request happens before the final `generate()` call.
- Interactive Mode keeps `MENUS` as data; AI pieces layer onto it: `askCmd`,
  a session `activePersona` state, AI confirmations, and `_menus`/test hooks.
- Vault is never written by diagnostics, retrieval, suggestions, or
  Interactive Mode itself.

## Files

```text
commands/ask.js                   — new: obs ask (AI vault context)
commands/doctor.js                — Diagnostics section + diagnostics in --json
commands/review.js                — Next Actions section (review signals)
commands/related.js               — identity-resolved backlinks, explanations
commands/suggest.js               — v2 recommendations (structure/folder/tag/template)
commands/interactive.js           — AI submenu: Ask Vault, Persona, AI opt-in
checks/context.js                 — new: deterministic local retrieval + buildContext
checks/diagnostics.js             — new: 10 diagnostic codes
checks/review.js                  — review signals (Next Actions)
checks/related.js                 — identity-based backlinks, similarity ranking
checks/suggest*.js                — recommendations engine
utils/relationship/similarity.js  — new: body-similarity scoring
utils/relationship/scanner.js     — backlink identity resolution
utils/vaultIndex.js               — index feeding diagnostics/retrieval
utils/structure.js / folders.js / templates.js — suggestion sources
docs/ARCHITECTURE.md              — Deeper Diagnostics, AI Vault Context (v1.7.0)
docs/AI.md                        — obs ask section + options
docs/COMMANDS.md                  — Interactive AI (Ask Vault, Persona, AI workflows)
CHANGELOG.md                      — [Unreleased] — v1.7.0 entry
README.md                         — badge -> v1.7.0
package.json                      — version -> 1.7.0
RELEASE_NOTES_v1.7.0.md           — this file
```

## Tests

- Baseline: **533 passing** (v1.6.4) → **720 passing** (+187)
- New/expanded suites: `test/ask.test.js`, `test/context.test.js`,
  `test/diagnostics.test.js`, `test/reviewSignals.test.js`,
  `test/similarity.test.js`, `test/suggestRecommendations.test.js`,
  `test/related.test.js`, `test/interactiveAi.test.js`, plus the v1.6.4 menu
  and dispatch suites (`test/interactiveMenu.test.js`,
  `test/interactiveDispatch.test.js`) reconciled with the AI opt-in flow.
- Verified three consecutive full-suite runs: **720 / 720 / 720 passing**
- `obs --version` -> `1.7.0`; `git diff --check` clean.

## Compatibility

- 100% backward compatible with v1.6.4: existing commands, flags, output, the
  v1.6.3 integrity report, and the v1.6.4 interactive menus are preserved.
- No new runtime dependency. No mandatory network access; AI features require a
  configured provider and are opt-in inside Interactive Mode.
- Read-only with respect to the vault: diagnostics, retrieval, suggestions,
  and Interactive Mode never write notes.

## Known limitations

- Interactive prompts are verified through stubs (non-TTY environment); real
  TTY navigation is checked manually.
- `obs ask` answers are only as good as the retrieved sources: with no relevant
  note it skips the AI rather than inventing details.
- Body-similarity scoring favors notes already connected to the target; a
  completely isolated note has nothing to rank against.