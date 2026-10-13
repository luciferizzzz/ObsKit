# ObsKit v1.6.4 — Complete Interactive Mode

**Release date:** 2026-10-13
**Type:** Feature release (SemVer-compatible with v1.6.3)

---

## Highlights

- **Interactive Mode now exposes every user-facing command** — running `obs`
  with no arguments opens a menu that covers note management, browsing,
  knowledge, utilities, and configuration, not just a subset.
- Main menu reorganised into **10 focused submenus**: Notes, Browse, Knowledge,
  Intelligence, Relationships, AI, People, Template, Utilities, Config.
- **New in the menu:** Rename Note, Move Note, Open Note, Note Info, List Notes,
  Folder Tree, Report, Dead Links, Backlinks, Orphan Notes, Graph, Tags, Todo
  List, Attachments, Backup Vault, Archive Notes, Cleanup Vault, Config
  (show/set/ai/reset), and Create Note from Template.
- **Safer interaction:** Ctrl+C at any prompt returns to the previous menu
  instead of ending the session; a failing command reports the error and returns
  to the menu.
- **+17 focused tests** — full suite: **533 tests, all passing** (baseline 516).
- **No new dependency.** Interactive Mode still reuses the existing command
  modules; the non-interactive CLI is unchanged and the vault is never written.

---

## What's new

### Full menu coverage

| Submenu | Entries |
|---------|---------|
| **Notes** | New Note, Today, Find Note, Rename Note, Move Note, Open Note, Note Info |
| **Browse** | List Notes, Folder Tree, Recent Notes, Random Note, Random & Open, Vault Stats, Dashboard, Report |
| **Knowledge** | Dead Links, Backlinks, Orphan Notes, Graph, Tags |
| **Intelligence** | Vault Doctor, Related Notes, Suggestions, Review |
| **Relationships** | View Relations, Add Relation, Remove Relation |
| **AI** | Write Note, Tomorrow Plan, Update, Weekly Review, People Note |
| **People** | List People, Recent People, People Stats |
| **Template** | List Templates, Preview Template, Create Note from Template |
| **Utilities** | Todo List, Attachments, Backup Vault, Archive Notes, Cleanup Vault |
| **Config** | Show Configuration, Set Vault Path, AI Setup, Reset Configuration |

Commands that previously required the CLI are now reachable from the menu:
`rename`, `move`, `open`, `info`, `list`, `tree`, `report`, `deadlinks`,
`backlinks`, `orphan`, `graph`, `tags`, `attachments`, `backup`, `archive`,
`cleanup`, and `config`.

### Behaviour

- **Cancel-safe.** `promptMenu`, `promptText`, and `promptConfirm` centralise
  `ExitPromptError` handling: Ctrl+C returns one level (submenu to main) rather
  than ending the process.
- **Error-safe.** A `safeRun` wrapper reports a failed command (for example,
  "Vault is not configured") and returns to the menu; the session never exits
  because a single command failed.
- **Confirm before destructive config.** Reset Configuration asks for
  confirmation (default **No**) before clearing the vault path.
- **Menus as data.** Menu definitions live in a single `MENUS` map, so the
  structure is easy to maintain and to test.

### CLI impact

None. Interactive Mode calls the same `commands/*` modules as the CLI;
`bin/obs.js` is untouched and every non-interactive command behaves exactly as
before.

---

## Implementation notes

- Menu definitions are kept as data in `commands/interactive.js` and exposed for
  tests via `module.exports._menus`.
- Added helpers `promptMenu`, `promptText`, `promptConfirm`, and `safeRun`.
- `hello` (a test command) and `completion` (which prints a shell script) are
  intentionally not placed in the menu.
- No additional runtime dependency; `@inquirer/prompts` was already in use.

## Files

```text
commands/interactive.js            — 10 grouped submenus, MENUS as data,
                                     promptMenu / promptText / promptConfirm /
                                     safeRun
test/interactiveMenu.test.js       — new (7 tests, menu structure)
test/interactiveDispatch.test.js   — new (10 tests, dispatch / cancel / error)
docs/COMMANDS.md                   — Interactive Mode section
CHANGELOG.md                       — [1.6.4] entry
README.md                          — badge -> v1.6.4
package.json                       — version -> 1.6.4
RELEASE_NOTES_v1.6.4.md            — this file
```

## Tests

- Baseline: **516 passing** -> **533 passing** (+17)
- `test/interactiveMenu.test.js` — every group exists, each group leads to a
  valid submenu, each submenu has a Back path, each command sits in the correct
  submenu, no duplicate values, and every entry has a label and value.
- `test/interactiveDispatch.test.js` — stubs `@inquirer/prompts` and the
  `commands/*` modules via `require.cache`, then drives `interactive()`: all
  submenus open and return; `rename` / `move` / `backlinks` / `info` forward
  their arguments; empty `tags` lists all tags; `review` defaults to `week`;
  `config reset` is skipped when the confirmation is declined; a failing command
  reports and returns to the menu; cancel goes back one level; cancel at the main
  menu exits cleanly.
- Verified three consecutive full-suite runs: **533 / 533 / 533 passing**
- `obs --version` -> `1.6.4`; `git diff --check` clean.

## Compatibility

- 100% backward compatible with v1.6.3: existing commands, flags, and output are
  preserved. Interactive Mode is additive.
- No new runtime dependency. No network access. No AI requirement.
- Read-only with respect to the vault: no note is written, moved, or renamed by
  Interactive Mode itself.

## Known limitations

- Interactive prompts are verified through stubs (non-TTY environment); real TTY
  navigation is checked manually.
- AI wiring in the menu (Ask Vault, Persona, `suggest --ai`, `review --ai`) is
  **not** part of this release — it belongs to the v1.7.0 Intelligence Workflow
  branch.
- `hello` and `completion` are intentionally excluded from the menu.
