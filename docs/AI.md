# 🤖 AI — ObsKit

This document explains the AI system of **ObsKit** (OBS = Organized Knowledge System): providers, configuration, workflows, commands, environment variables, troubleshooting, and best practices.

> **Related docs:** [CONFIGURATION.md](CONFIGURATION.md) · [COMMANDS.md](COMMANDS.md) · [README.md](../README.md)

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Supported providers](#-supported-providers)
- [AI configuration](#-ai-configuration)
- [`obs config ai`](#-obs-config-ai)
- [Personas](#-personas)
- [AI workflows](#-ai-workflows)
- [AI commands](#-ai-commands)
- [Daily journal](#-daily-journal)
- [Tomorrow planning](#-tomorrow-planning)
- [Weekly planning](#-weekly-planning)
- [People interactions](#-people-interactions)
- [AI file writing](#-ai-file-writing)
- [AI note generation](#-ai-note-generation)
- [Environment variables](#-environment-variables)
- [Troubleshooting](#-troubleshooting)
- [Best practices](#-best-practices)

---

## ✨ Overview

The AI assistant can **generate, update, and organize notes** directly inside your vault — all from the terminal. It supports both **local** models (running on your machine) and **cloud** APIs.

**What AI can do**

- Generate notes from a prompt
- Write directly to any file in the vault
- Fill daily notes (`## Target`, `## Catatan`, `## Selesai`, `## Mood`, `## Syukur`, `## Refleksi`)
- Fill template placeholders (`{{ai:...}}`)
- Create tomorrow plans
- Update today's daily note
- Create weekly plans
- Run interactive journaling sessions

---

## ✅ Supported providers

| Provider | Type | Notes |
|----------|------|-------|
| **Ollama** | Local | Free, fully offline. Default provider. |
| **OpenAI** | Cloud | Official OpenAI API. |
| **OpenRouter** | Cloud | One API key for many models. |
| **LM Studio** | Local | Local server, OpenAI-compatible. |
| **Any OpenAI-compatible API** | Local/Cloud | Any server exposing `/v1/chat/completions`. |

> All cloud providers (OpenAI, OpenRouter, LM Studio, and other compatible APIs) use the same **OpenAI client** with different `baseUrl` values. The active provider is selected via `ai.provider` in `config.json`.

### Ollama (local)

Runs models locally — free, private, no internet required.

```bash
ollama pull qwen2.5-coder:7b
ollama serve
```

Then configure with `obs config ai` (URL `http://127.0.0.1:11434`, model `qwen2.5-coder:7b`).

### OpenAI (cloud)

```bash
obs config ai   # choose OpenAI, paste key, pick model & base URL
```

Defaults: model `gpt-4o-mini`, base URL `https://api.openai.com/v1`.

### OpenRouter

Use any model through one key. Configure with:

- **Base URL:** `https://openrouter.ai/api/v1`
- **Model:** full slug, e.g. `anthropic/claude-3.5-sonnet`

### LM Studio (local)

Start the local server (Developer tab → Start Server), then:

- **Base URL:** `http://localhost:1234/v1`
- **Model:** the exact model name loaded in LM Studio
- **API key:** any value (e.g. `lm-studio`)

### Any OpenAI-compatible API

Same as OpenAI, but change `baseUrl`. Examples: Together AI, Groq, Mistral, or any proxy exposing `/v1/chat/completions`.

---

## ⚙️ AI configuration

The `ai` section of `config.json` controls the provider.

```json
{
  "ai": {
    "provider": "ollama",
    "ollama": { "url": "http://127.0.0.1:11434", "model": "qwen2.5-coder:7b" },
    "openai": { "apiKey": "sk-...", "model": "gpt-4o-mini", "baseUrl": "https://api.openai.com/v1" }
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `ai.provider` | `"ollama"` | `"ollama"` or `"openai"` |
| `ai.ollama.url` | `http://127.0.0.1:11434` | Ollama server URL |
| `ai.ollama.model` | `qwen2.5-coder:7b` | Ollama model |
| `ai.openai.apiKey` | — | API key (or use env var) |
| `ai.openai.model` | `gpt-4o-mini` | Model id / slug |
| `ai.openai.baseUrl` | `https://api.openai.com/v1` | API base URL |

See [CONFIGURATION.md](CONFIGURATION.md) for the full reference.

---

## 🛠️ `obs config ai`

Interactive wizard for choosing and setting up the AI provider.

```bash
obs config ai
```

1. **Choose the provider** — Ollama (local) or OpenAI/API key (cloud).
2. **Ollama** → URL and model.
3. **OpenAI** → API key (masked input), model, and base URL.

```text
✅ Konfigurasi AI berhasil disimpan.
```

Verify with `obs config show` — the API key is masked (`********abcd`).

---

## 🎭 Personas

Personas are reusable AI "characters" that control how the assistant writes. A persona defines the system instructions, response style, and optional workflow guidance for the AI. The default persona reproduces the original ObsKit behavior exactly, so existing commands keep working unchanged.

### Built-in persona

| Persona | id | Description |
|---------|-----|-------------|
| **Default** | `default` | Bahasa Indonesia santai, langsung ke intinya (the original ObsKit system prompt). |

### Selecting a persona

Every `obs ai` workflow accepts the `-p, --persona <name>` option. Match is case-insensitive by `id` or `name`.

```bash
obs ai "Explain closures" -p default
obs ai people "John Doe" --persona Default
```

Running `obs ai` without `--persona` always uses the **Default** persona.

### Adding a persona

Personas are defined as plain data in `utils/persona.js` (or registered at runtime via `registerPersona`). Each persona needs:

- `id` — unique slug
- `name` — display name
- `system` — system instructions sent before every prompt

Optional fields: `description` (short summary) and `instructions` (workflow-specific guidance).

```js
// utils/persona.js — PERSONAS array
{
  id: "concise",
  name: "Concise",
  description: "Short, bullet-focused answers.",
  system: "Answer in short bullet points only. No introductions."
}
```

Adding a persona never requires rewriting an AI command — commands resolve the persona through `resolvePersona(name)`.

> Persona logic lives in `utils/persona.js`, fully separate from the AI provider client in `utils/ai.js`.

---

## 🔀 AI workflows

A complete planning workflow is supported:

| Command | Purpose | Output location |
|---------|---------|-----------------|
| `obs ai tomorrow` | Plan the next day | `Planning/Tomorrow/YYYY-MM-DD.md` |
| `obs ai update` | Update today's daily note | `Daily Notes/YYYY-MM-DD.md` |
| `obs ai weekly` | Plan the upcoming week | `Planning/Weekly/Week-<n>.md` |
| `obs ai --ask --daily` | Interactive daily journal | `Daily Notes/YYYY-MM-DD.md` |

```text
obs ai tomorrow   →  Planning/Tomorrow/2026-08-07.md
obs ai update     →  Daily Notes/2026-08-06.md   (section-by-section)
obs ai weekly     →  Planning/Weekly/Week-32.md
```

All commands work with every supported provider.

### Tomorrow → Update flow

`obs ai update` automatically reads the **previous daily note** (`Daily Notes/YYYY-MM-DD.md`) and imports its `## Tomorrow` checklist items into today's note under a dedicated `## Update` section:

```markdown
# Yesterday's note                                # Today's note (after obs ai update)

## Tomorrow                                       ## Update
- [ ] Finish relationship tests                    - [ ] Finish relationship tests
- [ ] Update documentation                        - [ ] Update documentation
- [ ] Test Windows compatibility                  - [ ] Test Windows compatibility
```

- Only `- [ ]` / `- [x]` checklist items are imported. Sections, paragraphs, or bullets after `## Tomorrow` are never copied.
- Checklist state is preserved as written (`[ ]` / `[x]`).
- The import is **idempotent** — rerunning `obs ai update` never duplicates a task.
- The tasks are also sent to the AI as context when generating today's sections.
- If the previous note is missing, has no `## Tomorrow`, or the section is empty, `obs ai update` works exactly as before.
- CRLF line endings are preserved.

---

## 🛠️ AI commands

### `obs ai <prompt>`

Generate a note about a prompt.

```bash
obs ai "Explain JavaScript closures"
```

**Options**

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --title <title>` | Custom title | `AI Note` |
| `-f, --folder <folder>` | Destination folder | `AI` |
| `--file <path>` | Write to a specific file | — |
| `--daily` | Append to today's daily note | — |
| `--ask` | Interactive question mode | — |
| `--template <name>` | Use a template | — |
| `-p, --persona <name>` | AI persona to use | `default` |

**Notes**

- The command dispatches to dedicated workflows for `tomorrow`, `update`, `weekly`, and `people`.

---

## 📖 Daily journal

### `obs ai --ask --daily`

Structured daily interview: answer **9 questions**, the AI builds a daily note with 6 sections.

```bash
obs ai --ask --daily
```

**Questions asked**

1. 🎯 What was your most important activity today?
2. 🕐 What time did it happen?
3. ✅ What went well?
4. ⚠️ What didn't go well?
5. 📚 What did you learn?
6. 🔧 What should be improved?
7. 👥 Who did you interact with today?
8. ⚡ How was your energy level?
9. 😊 How did you feel today?

**Sections filled**

- `## Target Hari Ini`
- `## Catatan`
- `## Selesai`
- `## Mood`
- `## Syukur`
- `## Refleksi`

Existing daily notes are updated **in place**; missing sections are created automatically.

### `obs ai <prompt> --daily`

Append AI content under `## Catatan` in today's daily note.

```bash
obs ai "Focus areas today" --daily
```

---

## 🗓️ Tomorrow planning

### `obs ai tomorrow`

Structured multi-activity planning session that produces a **Tomorrow** plan with `- [ ]` checklists and time blocks.

```bash
obs ai tomorrow
```

**Interview process**

The command asks for each activity one by one:

1. 🎯 Activity name (type 'selesai' to stop adding activities)
2. 🕐 Start time (e.g. `08:00`)
3. 🕑 End time (e.g. `09:00`)
4. ⚡ Priority (`High` / `Medium` / `Low`)
5. 🎯 Goal for this activity
6. 📝 Additional notes (optional)

**Generated note structure**

```markdown
# Tomorrow

- [ ] 08:00-09:00 Learn JavaScript
  - Priority: High
  - Goal: Finish the Array section in FreeCodeCamp

- [ ] 10:00-12:00 Develop ObsKit
  - Priority: High
  - Goal: Complete People Management.
  - Catatan: Focus on tests
```

**Location:** `Planning/Tomorrow/YYYY-MM-DD.md`

---

## 📅 Weekly planning

### `obs ai weekly`

Interactive weekly planning with a **retrospective review** and forward-looking weekly schedule.

```bash
obs ai weekly
```

**Interview process**

The command first asks for a review of the current week, then plans for next week:

**Review questions:**

- 🏆 Biggest achievement this week?
- ⏰ What consumed most of your time?
- 📚 What did you learn?
- 👥 Who did you interact with the most?
- 😴 How was your sleep?
- ⚡ How was your energy level?
- 🛠️ What ObsKit features were completed?
- 🐛 What problems were discovered?

**Planning questions:**

- 🎯 Main goal for next week?
- ⚡ Top priorities?
- 💪 Personal goals?
- 📚 What to learn?
- ⏰ Important deadlines?
- 🔄 Habits to maintain?

**Generated note structure**

```markdown
# Weekly Review & Plan

## Achievements
## Productivity
## Learning
## Relationships
## Health
## ObsKit Development
## Goals for Next Week
## Monday
## Tuesday
## Wednesday
## Thursday
## Friday
## Saturday
## Sunday
## Notes
```

**Location:** `Planning/Weekly/Week-<n>.md`

---

## 👤 People interactions

### `obs ai people <name>`

Updates an existing **People** note with a new interaction, using a structured interview and the AI to structure the entry.

```bash
obs ai people "John Doe"
```

**Workflow**

1. Locates the People note for `<name>` anywhere in the vault (case-insensitive).
2. Reads the note content.
3. Asks a structured interview:
   - 🕐 When did the interaction happen?
   - 💬 What topics were discussed?
   - 📚 What did you learn from this interaction?
   - 📋 Is follow-up required?
   - ❤️ Does this relationship need more attention?
4. Sends the note context + interaction to the AI (with the selected persona).
5. Converts the AI output into `- ` bullet points for the `## Catatan Interaksi` section.
6. Shows a **preview** of the change.
7. Writes only after explicit confirmation.

**Example**

```bash
obs ai people "John Doe"
```

```text
? 📝 Interaksi terakhir dengan John Doe? Discussed the website project, John will help with the frontend next week

🧠 AI sedang memproses...

📄 Preview perubahan untuk John Doe.md:

## Catatan Interaksi

+ - Discussed the website project.
+ - John Doe agreed to help with the frontend next week.
+ - Follow-up: send the website design.

? Tulis perubahan ini ke note? yes

✅ Interaksi ditambahkan ke People note!
📁 D:\Vault\People\John Doe.md
```

**Behavior**

- Works with the existing **People template** structure — bullets are appended under `## Catatan Interaksi` (the section is created if missing).
- Existing content and other sections (`Informasi Dasar`, `Kontak`, `Kepribadian`, `Pertemuan`, …) are never modified.
- Interaction history stays **chronological** (new entries are appended, never overwritten).
- Duplicate bullets (case-insensitive) are skipped.
- Markdown formatting and **CRLF line endings** are preserved.
- Nothing is written without confirmation.
- If no `<name>` argument is given, the name is requested interactively.
- Missing People note → `People note tidak ditemukan: <name>`.

---

## 📝 AI file writing

### `obs ai <prompt> --file <path>`

Write AI content directly to a specific file. The path can be **relative to the vault** or **absolute**.

```bash
obs ai "Chapter 3 summary" --file "Reading/Clean Code/Chapter 3.md"
obs ai "Meeting recap" --file "D:\Meetings\2026-08-06.md"
```

The target file is created (including parent folders); existing files are **not overwritten**.

---

## 🧠 AI note generation

### `obs ai <prompt>`

Generates a note in the `AI/` folder by default.

```bash
obs ai "Remote work productivity tips" -t "Remote Work" -f "Notes/Productivity"
```

### `obs ai <prompt> --template <name>`

Generate a note using a template. `{{ai:...}}` placeholders are filled by the AI.

```bash
obs ai "Q3 launch plan" --template project -t "Q3 Launch"
```

See [TEMPLATE_GUIDE.md](TEMPLATE_GUIDE.md) for details.

---

## 🌿 Environment variables

### `OPENAI_API_KEY`

Set the API key without storing it in `config.json`.

```powershell
# Windows (PowerShell)
$env:OPENAI_API_KEY = "sk-..."
```

```bash
# Linux / macOS
export OPENAI_API_KEY="sk-..."
```

> **Priority:** `ai.openai.apiKey` in `config.json` overrides the environment variable.

---

## 🔧 Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Ollama belum jalan...` | Ollama not running | `ollama serve`; verify `curl http://127.0.0.1:11434/api/tags` |
| `Gagal connect ke Ollama` | Wrong URL / network | Check `ai.ollama.url` |
| `Belum ada API key...` | No key configured | `obs config ai` or set `OPENAI_API_KEY` |
| `API error: 401` | Invalid/expired key | Re-run `obs config ai` |
| `API error: 404` | Wrong model name (OpenRouter/LM Studio) | Use exact slug / loaded model name |
| `API error: 429` | Rate limit / quota | Wait, upgrade plan, or switch model |
| Response timeout | Response > 5 minutes | Smaller model, shorter prompt, faster provider |
| `Provider AI tidak dikenal` | Bad `ai.provider` | Must be `"ollama"` or `"openai"` |

---

## 💡 Best practices

- **Start with Ollama** — free and private. Upgrade to cloud only if you need bigger models.
- **Journal in the evening** — `obs ai --ask --daily` is designed for end-of-day reflection.
- **Plan tomorrow before finishing today** — `obs ai tomorrow` works best with fresh context.
- **Keep prompts specific** — short, focused prompts produce better notes.
- **Use templates for repeatable formats** — consistent structure, less editing.
- **Never commit real API keys** — prefer `OPENAI_API_KEY`.
- **Review AI output** — AI content is a starting point, not the final word.
- **Pull a reasonable local model** — 7B models give good results; very small models produce poor text.
