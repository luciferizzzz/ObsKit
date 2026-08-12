# ❓ FAQ — ObsKit

Frequently asked questions about installing, configuring, and using **ObsKit** (OBS = Organized Knowledge System).

> **Related docs:** [COMMANDS.md](COMMANDS.md) · [CONFIGURATION.md](CONFIGURATION.md) · [AI.md](AI.md) · [TEMPLATE_GUIDE.md](TEMPLATE_GUIDE.md)

---

## 📋 Table of Contents

- [Installation & updates](#-installation--updates)
- [Platform support](#-platform-support)
- [Vault & paths](#-vault--paths)
- [AI](#-ai)
- [Templates](#-templates)
- [Multiple vaults](#-multiple-vaults)
- [Common errors](#-common-errors)

---

# 📦 Installation & Updates

### `obs` command not found

The CLI is not linked or the npm global bin is not on your `PATH`.

**Fix**

```bash
npm link
```

On Windows, also check that the npm global bin folder (from `npm config get prefix`) is on your `PATH`, or use the bundled `obs.bat`.

### How do I update the CLI?

```bash
git pull
npm install
```

### `'obs' is not recognized as an internal or external command` (Windows)

Same as "`obs` command not found" — re-run `npm link` and verify your `PATH`. If `npm link` keeps failing, call it directly: `node bin/obs.js --help`.

### Which Node version do I need?

**Node.js 18+** — the CLI uses modern features like `fetch` and `AbortController`.

### Common installation problems

| Problem | Fix |
|---------|-----|
| `npm install` fails | Check Node/npm version, delete `node_modules` + `package-lock.json`, retry |
| `obs` not found | `npm link`, or fix `PATH` |
| Permission errors | Use `npm link` without `sudo` (or fix npm global permissions) |
| Clone fails | Check the URL: `https://github.com/luciferizzzz/obskit.git` |

---

# 🖥️ Platform Support

### Does it work on Windows?

Yes. Windows is the primary platform — including `obs.bat`, the `start` command for opening notes, CRLF handling, and filename sanitization.

### Does it work on Linux?

Yes, for all command-line features. Opening notes uses platform default behavior; there is no `start`-equivalent, so `obs open` behavior may differ.

### Does it work on macOS?

Yes. macOS is supported like Linux. Cross-platform paths (`path.join`) are used throughout.

### Do I need Obsidian installed?

To **open** notes via `obs open` and to use the vault in the Obsidian app, yes. The CLI itself manages files directly and works without Obsidian running.

---

# 🗂️ Vault & Paths

### How do I configure a vault?

```bash
obs init
```

Enter the absolute path to your vault. It is saved to `config.json`.

### Vault path errors

If commands fail with `ENOENT` or use the wrong folder:

```bash
obs config show    # check the current vault
obs config set     # set the correct one
```

Common causes:

- Trailing spaces in the path (trimmed automatically, but remove them anyway).
- Wrong folder/note name in a command.
- Windows backslashes not escaped in a manually edited `config.json` (`D:\\Vault`).

### Can I manage multiple vaults?

Not yet — v1.x supports a **single vault** stored in `config.json`. Multiple vault support is planned for **v2.0** (see [ROADMAP.md](ROADMAP.md)). Today you can switch by re-running `obs config set`.

---

# 🤖 AI

### How do I choose an AI provider?

```bash
obs config ai
```

Choose **Ollama** (local) or **OpenAI / API key** (cloud). OpenRouter, LM Studio, and other OpenAI-compatible APIs use the OpenAI option with a different base URL.

### Which AI providers are supported?

- **Ollama** — local, free, offline
- **OpenAI** — cloud
- **OpenRouter** — many models, one key
- **LM Studio** — local, OpenAI-compatible
- **Any OpenAI-compatible API**

See [AI.md](AI.md) for setup instructions.

### AI timeout

Responses longer than **5 minutes** are aborted. Fixes:

- Use a smaller/faster model.
- Use a shorter prompt.
- Use a faster provider (cloud models are usually faster than small local ones).

### `Ollama belum jalan. Jalankan ollama serve dulu.`

Ollama is not running. Start it:

```bash
ollama serve
```

Verify: `curl http://127.0.0.1:11434/api/tags`

### `Belum ada API key...`

No key configured. Run `obs config ai` or set `OPENAI_API_KEY`.

### Is my API key safe?

Yes — keys are typed masked and shown masked (`********abcd`). Prefer `OPENAI_API_KEY` and never commit real keys.

### Does AI work offline?

Only with local providers (Ollama, LM Studio).

---

# 🧩 Templates

### What are templates?

Markdown skeletons for consistent note structure. Use them with:

```bash
obs new Notes "Meeting Notes" -t meeting
obs ai "Q3 goals" --template project -t "Q3 Planning"
```

### What templates are built in?

`daily`, `book`, `meeting`, `project`, `article`, `idea`, `people`, `journal`, `html`, `css`, `js`.

```bash
obs template --list
obs template --preview project
```

### Can the AI fill templates?

Yes — `{{ai:instruction}}` placeholders are filled by the AI when using `obs ai --template <name>`.

### Can I create my own templates?

Yes. Add a file to `templates/` (e.g. `templates/recipe.md`) and use it with `-t recipe`.

See [TEMPLATE_GUIDE.md](TEMPLATE_GUIDE.md) for details.

---

# 🗃️ Multiple Vaults

### Can I use several vaults at once?

Not in v1.x. The CLI reads a single `vault` from `config.json`. Planned:

- **v1.7 / v2.0** — multi-vault support with profiles
- **v2.1** — workspace profiles

**Workaround today:** re-run `obs config set` to switch vaults.

---

# 🚨 Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `'obs' is not recognized` | Not linked | `npm link`, fix `PATH` |
| `ENOENT: no such file or directory` | Wrong path / typo | Verify path, `obs config set` |
| `No configuration found. Run obs init first.` | Missing config | `obs init` |
| AI timeout | Response > 5 min | Smaller model, shorter prompt |
| `Note already exists: <name>.` | Name collision | Choose another name |
| `Note not found: <name>.` | Typo or wrong folder | Check folder + name |
| `Provider AI tidak dikenal` | Bad `ai.provider` | Re-run `obs config ai` |
| `API error: 401` | Invalid key | Re-run `obs config ai` |
| `API error: 404` | Wrong model slug | Use exact slug / model name |

---

For more details, see [README.md](../README.md), [COMMANDS.md](COMMANDS.md), [AI.md](AI.md), and [CONFIGURATION.md](CONFIGURATION.md).
