# ObsKit v1.6.0 — Automation & Intelligence

## Highlights

- **Vault Doctor** — a full, deterministic vault health analysis with a documented Health Score (0–100), `--json` for scripting, and `--verbose` for per-file detail
- **Related Notes** (`obs related`) — deterministic, weighted related-note discovery
- **Suggestions** (`obs suggest`) — actionable recommendations for any note, with optional AI guidance
- **Review** (`obs review`) — periodic activity digest (today / week / month / custom) with optional AI summary
- **Single-scan architecture** — doctor, related, suggest, and review share one vault index build, so analysis stays fast on large vaults

## Added

### `obs doctor` (rewritten)

- Scans the vault in one pass and reports:
  - **Issues**: broken links, orphan notes, empty notes, duplicate names, missing tags, no outgoing links, malformed frontmatter
  - **Warnings**: stale notes (not modified in 30 days), oversized notes (> 200 KB)
  - **Health Score** 0–100 with rating: `Excellent` (≥ 90), `Good` (≥ 75), `Fair` (≥ 50), `Needs Attention` (< 50)
- `--verbose` — lists the offending files under each category
- `--json` — machine-readable report (`vault`, counts, `score`, `rating`, optional `details`)

### `obs related <note>`

- Ranks every other note by weighted, deterministic signals:
  - Backlinks to the target (+10)
  - Shared outgoing links (+3 each)
  - Shared tags (+2 each)
  - Shared backlinks (+2 each)
  - Title token overlap (+1 each)
- Returns up to 10 results (`-n, --limit`), sorted by score then name, excluding self
- Unicode/emoji/spaced filenames fully supported

### `obs suggest <note>`

- **Issues**: empty note, duplicate title (same name in another folder), near-duplicate title (> 0.5 Jaccard similarity), unclosed frontmatter
- **Opportunities**: missing tags, no outgoing links, no backlinks, stale note, oversized note, open tasks, suggested links to the most related notes (up to 3, never already-linked or already in `## Related`)
- `--ai` — appends bounded AI guidance (note excerpt ≤ 1200 chars; never the whole vault)

### `obs review [period]`

- Periods: `today`, `week`, `month`, or `--days <n>` (default `week`)
- Reports: notes created/modified, pending tasks, relationships (links in `## Related` sections), broken links, orphan notes created, most active tags, and created/modified lists
- `--ai` — appends a bounded AI summary of the period

### Interactive Mode

- New **Intelligence** submenu: Vault Doctor, Related Notes, Suggestions, Review

## Architecture

- `utils/vaultIndex.js` — builds the shared single-scan index (sorted, deterministic)
  - Per note: `outgoing`, `outgoingDetails`, `tags` (lowercase, sorted), `backlinks`, `content`, `size`, `mtime`, `created` (birthtime), `relPath`
  - Plus `byName` (case-insensitive) and `referenced` sets
- `utils/tags.js` — canonical tag extraction (code-block aware); also used by `obs tags`, `obs info`, and vault report
- `checks/health.js` — health analysis + the documented score formula
- `checks/related.js` — weighted ranking
- `checks/suggest.js` — per-note recommendations
- `checks/review.js` — period aggregation
- No new dependencies; all local-first; AI remains optional

## Backward Compatible

- All existing commands, utilities, and tests keep their previous behavior
- `obs doctor` text output changed (it now shows the full report), `--json` is available for scripting
- No configuration changes required
- v1.5.x remains fully stable

## Tests

- Test suite grew from 385 to 424 tests (vault index, doctor/health, related, suggest, review)
- 424/424 passing