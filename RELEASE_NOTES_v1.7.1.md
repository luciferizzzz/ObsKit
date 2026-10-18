# ObsKit v1.7.1 — Search Foundation Hotfix

**Release date:** 2026-10-18
**Type:** Patch release (SemVer-compatible with v1.7.0)

---

## Highlights

- **Forward-slash paths in search results** — `searchFiles()`,
  `fuzzySearchFiles()`, and `searchByContent()` now always return
  vault-relative paths with `/` on every platform (Windows previously
  showed `\`). Absolute `path` values remain platform-native.
- **Unicode-safe content search** — `searchByContent()` no longer derives
  match offsets from a lowercased copy of the note. Line numbers and
  snippets stay correct when lowercase conversion changes string length
  (e.g. `İ` folds to two code units). Matching remains case-insensitive.
- **+8 regression tests** — full suite: **728 tests, all passing**
  (v1.7.0 baseline: 720).
- **No new runtime dependency.** No command, flag, ranking, or
  result-field changes; ObsKit remains read-only with respect to the vault.

---

## Fixed

- **Windows relative-path separators** — `relativePath` in search results
  was built from a raw `path.relative()`, producing `\` on Windows while
  `list` / `recent` / `tags` / `completion` already normalized to `/` and
  the documentation displays `/`. The three result-building sites now
  share one normalizer that replaces only the platform separator, so
  backslashes in POSIX file names are preserved.
- **Content-search offsets under Unicode case conversion** — match
  indices from `content.toLowerCase()` were used to slice the original
  content. When lowercasing changes string length (`İ`, U+0130 → two code
  units), every subsequent offset shifted: line numbers were wrong and
  snippets were truncated (e.g. `argo` instead of `cargo`). Matching now
  folds one code point at a time starting from positions in the original
  text, so reported indices are original-text indices by construction.

---

## Tests

- Regression: `test/searchRegression.test.js` — **8/8** (3 path-separator,
  2 Unicode-offset reproductions, 3 guards: case-insensitive Unicode, CRLF,
  result shape).
- Compatibility: `test/search.test.js` + `test/find.test.js` — **32/32**.
- Full suite (`npm test`): **728 passing / 0 failures / 0 skipped**;
  `git diff --check` clean.
- `utils/search.js` (+81 / −10) is the only production file changed.

---

## Compatibility

- 100% backward compatible with v1.7.0 at the API level: exports, function
  signatures, filename ranking (exact → prefix → substring), fuzzy
  behavior, content-search defaults and exclusions, and result fields are
  unchanged.
- **Windows CLI output:** `obs find` now prints forward-slash paths —
  aligned with `list` / `recent` / `tags` and the documented output format.
- Read-only with respect to the vault; no new dependency; no network
  requirement.

---

## Known limitations

- A query that previously "matched" inside the partial lowercase fold of a
  length-expanding character (e.g. `i` inside `İ`) no longer matches; such
  matches always produced incorrect snippets in v1.7.0.
- Tests were executed on Windows (`win32`). POSIX separator behavior is
  correct by construction (only the platform separator is replaced) and
  guarded by tests, but was not executed in the release test runs.
- Case-mapped characters outside the BMP are consumed correctly by the
  matcher but have no dedicated regression test.
- The new matcher is a JavaScript-level scan rather than a native
  `indexOf`; measured ad hoc at ~49 ms for a 1 MB file without a match
  (below the default 1 MB `maxBytes`) — not a controlled benchmark.
