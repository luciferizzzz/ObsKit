# ObsKit v1.6.3 — Vault Integrity & Missing References

**Release date:** 2026-10-12
**Type:** Maintenance release (SemVer-compatible with v1.6.2)

---

## Highlights

- **Vault Integrity report** in `obs doctor` — broken wiki-links, ambiguous
  references, duplicate basenames, missing attachments, and metadata/tag issues,
  each with the **exact note, line number, target, reason, and next action**
- **Read-only audit**: no link repair, no tag insertion, no note rename/move, no
  metadata mutation — nothing in your vault is ever written
- **+32 focused tests** — full suite: **516 tests, all passing** (baseline 484)
- New `obs doctor --note <path>` filter and additive `integrity` JSON output
- Optional, explicit integrity rules (`requiredFrontmatter`, `tagCatalog`) — no
  tag catalog or schema is assumed unless you configure one

---

## What's new

### `obs doctor` — Vault Integrity

`obs doctor` now prints a **Vault Integrity** section after the health score. The
default view summarizes counts; `--verbose` prints each finding with its location.

```text
Vault Integrity

  Errors               0
  Warnings             5
  Info                 3
  Affected notes       7

  Broken wiki-links    2
  Ambiguous references 1
  Duplicate basenames  1
  Missing attachments  2
  Metadata issues      3
  Tag issues           2

  Use `obs doctor --verbose` to inspect individual issues.
```

Verbose output:

```text
[WARNING] BROKEN_WIKI_LINK
File: Projects/ObsKit/Architecture.md
Line: 42
Target: [[Vault Index]]
Reason: [[Vault Index]] does not resolve to any note in the vault.
Action: Check the target name, rename or move the referenced note, or update the wiki-link.
```

### Diagnostic codes

| Code | Severity | Condition |
|------|----------|-----------|
| `BROKEN_WIKI_LINK` | warning | `[[Target]]` does not resolve to any note |
| `AMBIGUOUS_REFERENCE` | warning | A bare link matches more than one note with the same basename |
| `DUPLICATE_BASENAME` | info | Two or more notes share a basename (informational) |
| `MISSING_ATTACHMENT` | warning | A local attachment/file reference cannot be resolved |
| `MALFORMED_FRONTMATTER` | error | `---` opened but never closed |
| `DUPLICATE_FRONTMATTER_KEY` | warning | A frontmatter key is declared more than once |
| `MISSING_REQUIRED_FIELD` | warning | A field in `integrity.requiredFrontmatter` is absent |
| `TAG_SPELLING_VARIANT` | warning | The same tag is written in more than one way |
| `UNRECOGNIZED_TAG` | warning | A tag is not in `integrity.tagCatalog` |

Locations are derived from the parser's byte offsets, never guessed. Findings
that cannot be tied to an exact line (missing required field, duplicate basename)
omit the line number rather than fabricate one.

### Locations are exact and deduplicated

- Two broken links on **different lines** remain two occurrences, even when they
  point to the same target.
- Identical findings at the same location and target are collapsed.
- Ordering is deterministic (severity → code → path → line → target) and
  byte-identical across machines.

### Optional rules (configuration)

Add to `config.json` only if you want these checks:

```json
{
  "vault": "D:\\Vault",
  "integrity": {
    "requiredFrontmatter": ["title", "status"],
    "tagCatalog": ["project", "reference", "daily"]
  }
}
```

- `requiredFrontmatter` enables `MISSING_REQUIRED_FIELD`.
- `tagCatalog` enables `UNRECOGNIZED_TAG`.
- All other checks are always on and need no configuration.

### CLI

```bash
obs doctor                         # health + integrity summary
obs doctor --verbose               # per-issue locations
obs doctor --json                  # machine-readable report
obs doctor --note "Projects/Plan.md"
```

The new `integrity` object is **added** to `--json`; all existing fields
(`issues`, `warnings`, `duplicateNames`, `score`, `rating`, `details`) are
unchanged.

---

## Implementation notes

- Built on the existing single-scan `buildVaultIndex()` index and
  `parseWikiLinks()` parser — no second independent vault scanner.
- `parseWikiLinks()` gained an opt-in `{ withLines: true }` option; its default
  return shape is unchanged.
- `buildVaultIndex()` now records a line number on each `outgoingDetails` entry.
- Attachment checks use a known media/document extension allowlist, so dotted
  note names (e.g. `[[Version 2.0]]`) are not mistaken for missing files.

## Tests

- Baseline: **484 passing** → **516 passing** (+32)
- `test/integrity.test.js` — broken links, aliases/fragments, Unicode targets,
  nested paths, accepted casing, duplicate basenames, ambiguous references,
  missing attachments (wiki/markdown/URL-encoded), external URLs, config-gated
  metadata and tags, duplicate frontmatter keys, exact line numbers, dedup,
  deterministic ordering, empty/healthy vaults, `--note` filtering, JSON
  compatibility, and filesystem immutability
- Verified three consecutive full-suite runs: 516 / 516 / 516 passing
- Manual E2E across temporary vaults with SHA-256 + mtime snapshots: **all vault
  files unchanged**

## Compatibility

- 100% backward compatible with v1.6.2: existing `obs doctor` output and JSON
  fields are preserved; the integrity report is additive.
- No new runtime dependency. No network access. No AI requirement.

## Known limitations

- Orphan / empty / stale / large-note checks remain in their existing `doctor`
  sections and are not duplicated inside the integrity report.
- Attachment checks cover common media/document/archive extensions; unusual or
  source-code references and extensionless markdown links are not treated as
  files.
- Markdown `[text](note.md)` links are not checked as broken (wiki-links only).
- This is an audit tool, not a repair bot: a future release may propose fixes
  with explicit confirmation.
