# 🔗 Relationships — ObsKit

How note relationships work in ObsKit (OBS = Organized Knowledge System): the relationship module, the `obs relate` / `obs unrelate` / `obs relations` commands, and how the reusable utilities power future knowledge features.

> **Related docs:** [COMMANDS.md](COMMANDS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [ROADMAP.md](ROADMAP.md)

---

## 📋 Table of Contents

- [What is a relationship?](#-what-is-a-relationship)
- [Commands](#-commands)
- [Relationship module](#-relationship-module)
- [Design rules](#-design-rules)
- [Future features](#-future-features)

---

## 💡 What is a relationship?

A **relationship** is a link between two notes. ObsKit distinguishes three kinds:

| Kind | Meaning | Example |
|------|---------|---------|
| **Related** | Explicit link stored in a `## Related` section | `- [[Rust]]` |
| **Backlink** | Another note links *to* this note | `Home.md` contains `[[Rust]]` |
| **Outgoing** | This note links *to* another note | `Rust.md` contains `[[Cargo]]` |

Related links are the **explicit** relationships managed by the CLI. Backlinks and outgoing links are **implicit** relationships derived from wiki links anywhere in the vault.

---

# 🎮 Commands

## `obs relate <note> <related>`

Add an explicit relationship.

**Description**

Adds `- [[related]]` to the `## Related` section of `<note>`, creating the section when it does not exist. It never duplicates an existing link (case-insensitive) and never corrupts the file.

**Syntax**

```
obs relate <note> <related>
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<note>` | Note receiving the relationship (without `.md`) |
| `<related>` | Related note (without `.md`) |

**Example**

```bash
obs relate Home Rust
```

```text
✅ Related added.
Home → Rust
```

```text
ℹ️  Already related.
Home → Rust
```

**Notes**

- Both notes must exist in the vault.
- Folders and `.md` suffixes are normalized automatically (`Notes/Rust.md` → `Rust`).
- A note cannot be related to itself.
- Existing line endings (LF / CRLF) are preserved.
- The link is written as `- [[Related]]` under a `## Related` heading.

---

## `obs unrelate <note> <related>`

Remove an explicit relationship.

**Description**

Removes `- [[related]]` from the `## Related` section of `<note>`. Only lines inside the Related section are removed — other links are untouched.

**Syntax**

```
obs unrelate <note> <related>
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<note>` | Note losing the relationship (without `.md`) |
| `<related>` | Related note (without `.md`) |

**Example**

```bash
obs unrelate Home Rust
```

```text
✅ Related removed.
Home → Rust
```

```text
ℹ️  Not related.
Home → Rust
```

---

## `obs relations <note>`

Show all relationships of a note.

**Description**

Lists the explicit **Related** links, **Backlinks** (notes that link to it), and **Outgoing** links (notes it links to).

**Syntax**

```
obs relations <note>
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<note>` | Note to inspect (without `.md`) |

**Example**

```bash
obs relations Home
```

```text
🔗 Relations for "Home"

Related
- [[Rust]]
- [[Go]]

Backlinks
- Index

Outgoing Links
- [[Rust]]
- [[Go]]

------------------------
Related: 2 · Backlinks: 1 · Outgoing: 2
```

**Notes**

- Errors with `Note not found: <note>` if the note does not exist.
- Outgoing links are deduplicated by normalized target.

---

# 🧩 Relationship module

All relationship logic lives in `utils/relationship/` as small, reusable modules:

| Module | Responsibility |
|--------|----------------|
| `parser.js` | Parse wiki links, aliases, headings, sections; normalize links |
| `validator.js` | Normalize note references; detect duplicates, self-references; validate links |
| `scanner.js` | Find note files; scan outgoing, incoming, and Related-section links |
| `editor.js` | Add/remove related links, ensure the `## Related` section, write markdown safely |
| `formatter.js` | Format relationship output for consistent CLI display |
| `index.js` | Export the public API for all relationship utilities |

Every relationship command composes these modules — no duplicated logic.

### `parser.js`

```text
[[Page]]                → { target: "Page", alias: null,  heading: null }
[[Page|Alias]]          → { target: "Page", alias: "Alias", heading: null }
[[Page#Heading]]        → { target: "Page", alias: null,  heading: "Heading" }
[[Page#Heading|Alias]]  → { target: "Page", alias: "Alias", heading: "Heading" }
[[Folder/Page]]         → { target: "Page", ... }          (folder stripped)
[[image.png]]           → skipped                          (attachments ignored)
```

Plus `normalizeTarget()`, `normalizeLink()`, `parseHeadings()`, and `getSectionContent()`.

### `validator.js`

- `normalizeNoteRef()` — lowercases a note reference and strips `.md`, folder, heading, and alias.
- `isDuplicate()` — checks whether a link already exists in a section (case-insensitive).
- `isSelfReference()` — prevents a note from relating to itself.
- `isValidLink()` — checks a target against the note index.

### `scanner.js`

- `findNoteFile()` — resolve a note name to its file path (case-insensitive).
- `scanOutgoingLinks()` — every note → its parsed wiki links.
- `scanIncomingLinks()` — every normalized target → its backlink sources.
- `scanRelatedLinks()` — links found inside the `## Related` section of a note.
- `collectRelationships()` — returns both the outgoing and incoming maps.

### `editor.js`

- `addRelated()` / `removeRelated()` — mutate markdown content (pure, testable).
- `addRelatedToFile()` / `removeRelatedFromFile()` — read → update → write.
- `ensureSection()` — create a missing heading.
- `updateMarkdown()` — write safely, preserving LF / CRLF line endings.
- `detectNewline()` — detect the dominant line ending of a file.

### `formatter.js`

- `formatRelations()` — full relationship display for `obs relations`.
- `formatAddResult()` / `formatRemoveResult()` — success/idempotent messages.
- `formatSelfReferenceResult()` — warns when a note would be related to itself.
- `dedupeLinks()` / `formatLinkList()` — shared list helpers.

### `index.js`

```js
const relationship = require("./utils/relationship");

relationship.parser.parseWikiLinks(content);
relationship.validator.normalizeNoteRef("Notes/Rust.md");
relationship.scanner.scanIncomingLinks(files);
relationship.editor.addRelatedToFile(file, "Home");
relationship.formatter.formatRelations(result);
```

---

# 🧭 Design rules

- **Architecture before UI** — reusable modules first, commands are thin wrappers.
- **Reuse over duplicate** — commands compose `utils/relationship/*`; nothing is copied.
- **Safe by default** — files are never corrupted: CRLF preserved, duplicates rejected, sections created only when missing.
- **Backward compatible** — `utils/wikilinks.js` delegates to the new parser with identical output.
- **Tested** — the module ships with a unit test suite (`npm test`).

---

# 🔭 Future features

The relationship module is the foundation for:

- **Graph** — richer relationship analysis (reuses `collectRelationships`).
- **AI Links** — AI-generated relationship suggestions.
- **Knowledge Explorer** — browse notes by relationship.
- **Dashboard** — relationship metrics.
- **Multi Vault** — relationship scans across vaults.
- **Web UI** — relationship endpoints backed by the same module.
