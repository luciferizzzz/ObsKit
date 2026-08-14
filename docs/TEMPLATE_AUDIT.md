# 🔍 Template Audit — ObsKit v1.5.1

Audit report for the **Better Templates** update. Prepared **before** any template files
were modified, on branch `feature/templates` (base: `main` @ `c894dba`).

> **Scope:** all 11 built-in templates in `templates/`.
> **Goal:** identify inconsistencies, missing sections, placeholder problems, duplicates,
> poor layouts, and AI-unfriendly structures. No files were changed during this audit.

---

## 📋 Table of Contents

- [Audited templates](#-audited-templates)
- [Findings overview](#-findings-overview)
- [Issue register](#-issue-register)
  - [Placeholder inconsistencies](#placeholder-inconsistencies)
  - [Formatting inconsistencies](#formatting-inconsistencies)
  - [Missing / duplicate sections](#missing--duplicate-sections)
  - [Layout problems](#layout-problems)
  - [AI-unfriendly structures](#ai-unfriendly-structures)
- [Template-by-template findings](#-template-by-template-findings)
- [Required code compatibility](#-required-code-compatibility)
- [Recommended actions](#-recommended-actions)

---

## 🧾 Audited Templates

| Template | File | Purpose |
|----------|------|---------|
| Daily | `templates/daily.md` | Daily journal, 6 AI-workflow sections |
| Book | `templates/book.md` | Book review / reading notes |
| Project | `templates/project.md` | Project tracker |
| Meeting | `templates/meeting.md` | Meeting notes |
| Article | `templates/article.md` | Article writing |
| Journal | `templates/journal.md` | Free-form journal |
| Idea | `templates/idea.md` | Quick idea capture |
| People | `templates/people.md` | People profile + `obs ai people` target |
| JavaScript | `templates/js.md` | JS programming note |
| HTML | `templates/html.md` | HTML programming note |
| CSS | `templates/css.md` | CSS programming note |

---

## 📊 Findings Overview

| Category | Count |
|----------|-------|
| Placeholder inconsistencies | 8 |
| Formatting inconsistencies | 5 |
| Missing / duplicate sections | 4 |
| Layout problems | 4 |
| AI-unfriendly structures | 3 |

All issues are cosmetic or structural — no template currently breaks an existing command.
However, several inconsistencies make the templates harder to maintain and less
predictable for the AI daily workflow and `obs ai --template`.

---

## 🔧 Issue Register

### Placeholder inconsistencies

1. **Non-standard metadata placeholders.** Six of eleven templates share the metadata line
   `**Tanggal:** {{date}} · **Folder:** {{folder}} · **Dibuat:** {{time}}`, but `book.md`
   uses `**Penulis:** {{penulis}} · **Folder:** {{folder}} · **Dibuat:** {{date}}`
   (different field order, `{{date}}` instead of `{{time}}`), and `daily.md` uses
   `**Hari:** {{day}} · **Tanggal:** {{date}} · **Folder:** Daily Notes` with no time field.
2. **No `{{created}}` / `{{updated}}` usage.** `getTemplateData()` already provides
   `{{created}}`, but no template uses it, and `{{updated}}` does not exist yet. The standard
   system cannot express "created" / "last updated" consistently.
3. **Inconsistent "tags" label.** `article.md` and `idea.md` write `**Tag:** {{tags}}`
   (singular label); there is no `{{tags}}` on the daily/meeting/people/project templates
   even where it would be useful.
4. **`{{status}}` used only on `project.md`.** It is the only template that exposes a status
   field; the label/format is not shared anywhere else.
5. **Custom fields are documented only in `docs/TEMPLATE_GUIDE.md`, not discoverable in the
   templates themselves.** E.g. `{{penulis}}`, `{{peserta}}`, `{{role}}`, `{{email}}`,
   `{{telepon}}`, `{{linkedin}}` appear inline but there is no consistent convention for
   where they belong.
6. **`daily.md` footer `Jam dibuat : {{time}}`** uses a non-standard label with odd spacing
   (`Jam dibuat :`), different from every other template's time handling. The AI daily
   workflow (`fillDailyTemplate`) depends on the literal text `Jam dibuat`, so any change
   must keep the token.
7. **Book fields order is unstable.** `**Penulis:**` appears before the standard
   `Tanggal/Folder` fields, while `Rilis/Genre/ISBN` are on a second line — the only
   template with two metadata lines that are not separated consistently.
8. **`{{role}}`, `{{email}}`, `{{telepon}}`, `{{linkedin}}` live only in `people.md`** and
   are replaced by nothing at render time (left for manual fill). Consistent behavior, but
   undocumented in the template body itself.

### Formatting inconsistencies

1. **Separator usage is inconsistent.** `daily.md`, `book.md`, `project.md`, `meeting.md`,
   `idea.md`, and `people.md` insert a `---` before their final section(s), while
   `article.md`, `journal.md`, `js.md`, `html.md`, and `css.md` do not. `daily.md` inserts
   `---` between **every** section.
2. **Missing `---` after the metadata header.** `book.md` has no rule after its metadata
   block; every other template does.
3. **Final section naming differs.** `meeting.md` ends with `## Catatan Tambahan` while all
   other templates that end with a catch-all use `## Catatan` (`book.md`, `project.md`,
   `idea.md`, `js.md`, `html.md`, `css.md`).
4. **Blank-line discipline is inconsistent.** Most sections are separated by exactly one
   blank line, but `book.md` `## Kutipan` / `## Poin Penting` are immediately followed by an
   `{{ai:…}}` block with no blank line after the heading in the guide, and code-fence
   templates (`js`/`html`/`css`) mix `-` placeholder lists and empty fences without blank
   lines in some spots.
5. **Trailing `---`.** `daily.md` and `people.md` end with a trailing `---` after content,
   which adds noise when the note is opened in Obsidian.

### Missing / duplicate sections

1. **People template is thin for the `obs ai people` workflow.** It only has `Profil`,
   `Kontak`, `Pertemuan`, `Catatan Interaksi`. There is no Basic Information block
   (name/nickname/first met/last interaction), no Personality, Interests, Important Facts,
   Conversation Topics, Relationship, or Related sections — the sections an AI needs to
   write natural, contextual interaction updates.
2. **No `## Related` section in any template** except implicitly nowhere. `obs relate`
   creates `## Related` on demand, but people/project notes would benefit from a stable
   insertion point.
3. **Daily and Journal overlap.** Both contain `Syukur` (gratitude) and `Refleksi`
   (reflection). This is intentional duplication of content for two different workflows, not
   an error — kept as-is, but noted.
4. **`project.md` Timeline has nested `Milestone` / `Task` sub-sections** that `meeting.md`
   and `idea.md` do not mirror; there is no shared "Next steps" convention across
   action-oriented templates.

### Layout problems

1. **Metadata field ordering** is inconsistent across templates (see placeholder issues 1–2).
2. **`daily.md` interleaves `---` between every section**, making it visually noisy and
   different from every other template.
3. **`people.md` and `daily.md` end with a dangling `---`.**
4. **Code templates (`js`/`html`/`css`)** repeat the same skeleton three times; the only
   differences are the fence language and the "Komponen" / "Elemen / Atribut" / "Properti"
   list. Layout is fine but should follow the exact same ordering (Pengertian → Sintaks →
   Komponen/Atribut/Properti → Contoh → Catatan).

### AI-unfriendly structures

1. **Ambiguous headings.** `## Catatan` in `daily.md` is the primary AI insertion target for
   `obs ai --daily`, while `book/project/idea/js/html/css` also use `## Catatan` for a
   different purpose. This is acceptable per note, but the AI daily workflow relies on the
   exact `## Catatan` heading — any future rename would break `obs ai`.
2. **`{{ai:…}}` instructions are not uniformly worded.** Some instruct a single sentence
   ("Deskripsi singkat …"), others a list ("berupa bullet points"), some are ambiguous
   ("Konten bagian pertama"). The AI fills them verbatim as prompts.
3. **No consistent "insert here" marker for AI-generated updates** other than the
   `{{ai:…}}` blocks and the `-` placeholder bullets; `people.md`'s `## Catatan Interaksi`
   is the only section with a dedicated append workflow.

---

## 📄 Template-by-Template Findings

### `daily.md`

- **Formatting:** inconsistent — `---` between every section; footer `Jam dibuat : {{time}}`
  with unusual spacing; trailing `---`.
- **Placeholders:** uses `{{date}}`, `{{day}}`, `{{time}}`; no `{{created}}`/`{{updated}}`;
  header line differs from all other templates.
- **Sections:** the six AI-workflow sections (`Target Hari Ini`, `Catatan`, `Selesai`,
  `Mood`, `Syukur`, `Refleksi`) are **locked** — `commands/ai.js` parses and fills exactly
  these headings. They must be preserved verbatim and in order.
- **Verdict:** clean up separators/footer; preserve the six sections and the `Jam dibuat`
  token.

### `book.md`

- **Formatting:** missing `---` after header; no blank-line discipline around AI blocks;
  metadata fields in a different order than every other template; `---` before final section.
- **Placeholders:** `{{penulis}}`, `{{rilis}}`, `{{genre}}`, `{{isbn}}` custom fields;
  `{{date}}` where others use `{{time}}`.
- **Sections:** `Ringkasan`, `Kutipan`, `Poin Penting`, `Kata Kunci`, `Review`, `Catatan` —
  well balanced, no missing sections.
- **Verdict:** align metadata line with the standard; add `---` after header; keep custom
  fields.

### `project.md`

- **Formatting:** `---` before final `Catatan`; otherwise close to standard.
- **Placeholders:** `{{status}}` only here; uses `{{date}}`/`{{time}}`.
- **Sections:** `Deskripsi`, `Tujuan`, `Ruang Lingkup`, `Risiko`, `Timeline` (`Milestone`,
  `Task`), `Catatan`. Complete.
- **Verdict:** minimal changes — standard metadata line, remove stray `---`.

### `meeting.md`

- **Formatting:** `---` before `Catatan Tambahan`.
- **Placeholders:** `{{peserta}}`; uses `{{date}}`/`{{time}}`.
- **Sections:** `Ringkasan`, `Agenda`, `Keputusan`, `Tindak Lanjut`, `Catatan Tambahan`.
  `Catatan Tambahan` is unique — should become `Catatan` for predictability.
- **Verdict:** rename final section, standard metadata line.

### `article.md`

- **Formatting:** no `---` after header (inconsistent with the majority); `Tag:` singular.
- **Placeholders:** `{{tags}}`; uses `{{date}}`/`{{time}}`.
- **Sections:** `Ide Utama`, `Pendahuluan`, `Isi` (`Bagian 1`, `Bagian 2`), `Kesimpulan`,
  `Referensi`. Complete.
- **Verdict:** standard metadata line, `---` after header, `**Tags:**` label.

### `journal.md`

- **Formatting:** no `---` after header; no trailing rule at all.
- **Placeholders:** `{{mood}}`; uses `{{date}}`/`{{time}}`.
- **Sections:** `Cerita Hari Ini`, `Apa yang Dilakukan`, `Syukur`, `Refleksi`,
  `Rencana Besok`. Complete.
- **Verdict:** standard metadata line + `---` after header.

### `idea.md`

- **Formatting:** `---` before final `Catatan`; `Tag:` singular.
- **Placeholders:** `{{tags}}`; uses `{{date}}`/`{{time}}`.
- **Sections:** `Ide`, `Kenapa Menarik`, `Tantangan`, `Langkah Berikutnya`, `Catatan`.
  Complete.
- **Verdict:** standard metadata line, `**Tags:**` label, remove stray `---`.

### `people.md`

- **Formatting:** `---` after header; trailing `---`; only template with `Profil` +
  `Kontak` + `Pertemuan` + `Catatan Interaksi`.
- **Placeholders:** `{{role}}`, `{{email}}`, `{{telepon}}`, `{{linkedin}}`; uses
  `{{date}}`/`{{time}}`.
- **Sections:** missing Basic Information, Personality, Interests, Important Facts,
  Conversation Topics, Relationship, Related. This is the **weakest template for the
  `obs ai people <name>` workflow** — the AI only sees a short `Profil` paragraph and a
  contact list before writing interaction bullets.
- **Code dependency:** `## Pertemuan` (`MEETINGS_HEADING`) and `## Catatan Interaksi`
  (`INTERACTIONS_HEADING`) are referenced by `utils/people.js` and asserted by
  `test/people.test.js`. They must be preserved verbatim.
- **Verdict:** major improvement planned (Phase 4).

### `js.md` / `html.md` / `css.md`

- **Formatting:** no `---` after header; no trailing rule; otherwise consistent skeleton.
- **Placeholders:** use `{{title}}` inside the AI instruction
  (`Jelaskan konsep JavaScript {{title}} …`); uses `{{date}}`/`{{time}}`.
- **Sections:** `Pengertian`, `Sintaks` (empty fence), `Komponen`/`Elemen / Atribut`/
  `Properti`, `Contoh` (empty fence), `Catatan`. Complete.
- **Verdict:** standard metadata line + `---` after header; keep the `{{title}}`-aware AI
  instructions (data placeholders are replaced before AI blocks are extracted).

---

## 🔗 Required Code Compatibility

The following template↔code contracts must survive the rework unchanged:

| Contract | Code | Locked content |
|----------|------|----------------|
| Daily sections | `commands/ai.js` (`parseSections`, `fillDailyTemplate`, prompts) | `## Target Hari Ini`, `## Catatan`, `## Selesai`, `## Mood`, `## Syukur`, `## Refleksi` |
| Daily footer token | `commands/ai.js` (`fillDailyTemplate` fallback) | line containing `Jam dibuat` |
| People interactions | `utils/people.js` `INTERACTIONS_HEADING` | `## Catatan Interaksi` |
| People meetings | `utils/people.js` `MEETINGS_HEADING` | `## Pertemuan` |
| Related section | `utils/relationship/editor.js` `RELATED_HEADING` | `## Related` |
| Placeholder engine | `utils/markdown.js` (`parseTemplate`, `getTemplateData`) | `{{key}}` and `{{ai:instruction}}` syntax |

---

## ✅ Recommended Actions

1. **Standardize the metadata line** across all templates:
   `**Tanggal:** {{date}} · **Folder:** {{folder}} · **Dibuat:** {{created}} · **Diperbarui:** {{updated}}`
   (add `{{updated}}` to `getTemplateData()`).
2. **Add one `---` after the metadata header**, remove stray inter-section `---`, and remove
   trailing `---` rules.
3. **Standardize labels:** `**Tags:** {{tags}}` (plural), `## Catatan` for catch-all
   sections.
4. **Rebuild `people.md`** with Basic Information / Contact / Personality / Interests /
   Important Facts / Conversation Topics / Relationship / Related sections while keeping
   `## Pertemuan` and `## Catatan Interaksi` verbatim for the `obs ai people` workflow.
5. **Keep every AI-workflow section heading verbatim** and add a regression test that locks
   them.
6. **Add a template test suite** (`test/templates.test.js`) covering rendering, placeholder
   replacement, AI-block extraction/fill, required headings, and `obs today` / `obs new -t`
   integration.

---

*Audit date: 2026-08-14 · Branch: `feature/templates` · No template files were modified
during this audit.*
