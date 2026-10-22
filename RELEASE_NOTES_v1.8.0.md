# ObsKit v1.8.0 — Search Foundation v2

**Release date:** 2026-10-22
**Type:** Feature release (SemVer-compatible with v1.7.1)

---

## Highlights

- **Result limits for `obs find`** — a new `-n, --limit <n>` flag caps how
  many results are displayed. The limit is applied to the order the command
  already displays, so the results that remain are the top-ranked ones, and
  `--pick` offers exactly those results. Values other than a positive
  integer are rejected with an error instead of being coerced.
- **Corrected content-search reporting** — `searchByContent()` now counts
  *every* occurrence in a file (previously the count was capped by the
  snippet limit) and reports the line, snippet, and first snippet of the
  *first* match (previously the line pointed at the last retained snippet).
- **Shared search behind `obs open`** — the command's own traversal and
  matching were replaced by the shared `searchFiles()` implementation, and
  the keyword is now trimmed. The command's established behavior — all file
  types, hidden folders, filesystem traversal order — is preserved.
- **+64 focused tests** — full suite: **792 tests, all passing**
  (v1.7.1 baseline: 728).
- **No new runtime dependency.** No change to ranking formulas, public
  exports, or result field names; ObsKit remains read-only with respect to
  the vault.

---

## What's new

### Result limits (`obs find`)

```bash
obs find cargo --limit 5
obs find cargo -n 5
```

- The limit is applied to the order each mode already displays:
  - default mode — filename ranking (exact → prefix → substring),
  - `--fuzzy` — fuzzy score,
  - `--content` — content match count.
- Without the flag, every result is shown, exactly as before.
- `--pick` opens the picker with exactly the limited results.
- A value that is not a positive integer is rejected with an Indonesian
  error; it is never silently coerced or ignored.

At the library level, `searchFiles()`, `fuzzySearchFiles()`, and
`searchByContent()` accept an optional `limit` option that caps the
returned results after each function's established ordering. Omitting it
keeps the previous unlimited behavior; an invalid value is rejected with an
error rather than silently ignored.

### Optional empty-query matching (`searchFiles`)

`searchFiles()` gains an opt-in `matchAllWhenEmpty` option that makes an
empty query match every file instead of none. It defaults to off, so the
default empty-query behavior of every other caller is unchanged. `obs open`
uses it to list the vault when the keyword is empty or whitespace-only.

---

## Fixed

- **Content-search match counts** (`searchByContent`) — `matches` was
  incremented only while snippets were being collected, so a file with more
  occurrences than `maxSnippets` reported a smaller count than it actually
  had. `matches` now counts every occurrence in the file;
  `maxSnippets` only caps how many snippets are kept.
- **Content-search line numbers** (`searchByContent`) — `line` was
  recomputed on every collected snippet and therefore described the *last*
  retained snippet. `line`, `snippet`, and `snippets[0]` now all describe
  the *first* content match. The result object keeps its existing fields.

---

## Changed

- **`obs open` delegates to the shared search implementation** — the
  command's hand-rolled directory recursion and filename matching were
  replaced by `searchFiles()`. Case-insensitive filename matching, the
  filesystem (readdir depth-first) traversal order, all file types, and
  hidden-folder traversal are unchanged.
- **`obs open` trims its keyword** — leading and trailing whitespace is
  removed before searching, so `obs open " rust "` searches for `rust`. A
  whitespace-only keyword now lists the same files an empty keyword does;
  an empty keyword already behaved that way.
- **`obs open` displays `/` separators** — relative paths in the result
  listing now use `/` on every platform, where Windows previously showed
  `\`.

---

## Tests

- New/expanded suites: `test/searchContentRegression.test.js` (13),
  `test/searchLimit.test.js` (14), `test/searchTraversal.test.js` (5),
  `test/open.test.js` (17), `test/find.test.js` (+15).
- Baseline: **728 passing** (v1.7.1) → **792 passing** (+64).
- Full suite (`npm test`): **792 passing / 0 failures / 0 skipped / 0
  todo**; `git diff --check` clean.
- The ordering and traversal tests compute their expected order directly
  from `fs`, so an introduced sort, reordering, or re-filtering is detected.

---

## Files

```text
bin/obs.js                            — obs find: -n, --limit <n>
commands/find.js                      — limit parsing + application per mode
commands/open.js                      — delegate to searchFiles(), trim keyword
utils/search.js                       — limit option, matchAllWhenEmpty option,
                                        H2/H3 match reporting
docs/COMMANDS.md                      — --limit flag; obs open notes
CHANGELOG.md                          — [1.8.0] entry
README.md                             — badge -> v1.8.0
package.json                          — version -> 1.8.0
RELEASE_NOTES_v1.8.0.md               — this file
```

---

## Compatibility

- Backward compatible with v1.7.1: every existing command, flag, output
  section, and result field is preserved. The new `-n, --limit` flag is
  additive and off by default.
- The public exports of `utils/search.js` are unchanged — the same 12
  names, with the same signatures; `searchFiles()` gains an *optional*
  option only.
- Ranking is unchanged: `rankResults()`, `fuzzyScore()`, and the
  content-search ordering (`matches` descending, then relative path) are
  byte-for-byte identical to v1.7.1. No ranking v2 work is included in
  this release.
- No new runtime dependency; `package.json` dependencies are unchanged.
- Read-only with respect to the vault; no network requirement.

---

## Known limitations

- The default `obs find` mode still ranks the complete result set before
  trimming it to the limit, so the limit reduces what is printed rather
  than the amount of traversal performed.
- The library-level `limit` option requires an actual positive integer;
  the CLI layer additionally accepts the digit string Commander supplies
  and converts it. The two layers therefore differ deliberately.
- `obs find --limit <invalid>` prints an error but still exits with status
  `0`, matching the existing error-reporting convention of the command.
  This is unchanged in this release.
- Tests were executed on Windows (`win32`). POSIX separator behavior is
  correct by construction (only the platform separator is replaced) and is
  guarded by tests, but was not executed in the release test runs.
