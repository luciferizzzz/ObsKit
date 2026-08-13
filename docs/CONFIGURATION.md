# ⚙️ Configuration — ObsKit

This document explains all configuration options of **ObsKit**: `config.json`, the `vault` field, AI settings, config commands, environment variables, examples, common mistakes, and troubleshooting.

> **Related docs:** [COMMANDS.md](COMMANDS.md) · [AI.md](AI.md) · [README.md](../README.md)

---

## 📋 Table of Contents

- [The `config.json` file](#-the-configjson-file)
- [Configuration fields](#-configuration-fields)
- [`vault`](#-vault)
- [AI configuration](#-ai-configuration)
- [`obs init`](#-obs-init)
- [`obs config`](#-obs-config)
- [`obs config ai`](#-obs-config-ai)
- [Environment variables](#-environment-variables)
- [Configuration examples](#-configuration-examples)
- [Common mistakes](#-common-mistakes)
- [Troubleshooting](#-troubleshooting)

---

# 📄 The `config.json` file

All configuration lives in **`config.json`** in the **project root** (next to `package.json`).

```text
obskit/
├── commands/
├── utils/
├── config.json          ← configuration file
├── config-example.json  ← starter template
└── package.json
```

A complete example:

```json
{
  "vault": "D:\\Vault",
  "ai": {
    "provider": "openai",
    "ollama": { "url": "http://127.0.0.1:11434", "model": "qwen2.5-coder:7b" },
    "openai": { "apiKey": "sk-...", "model": "gpt-4o-mini", "baseUrl": "https://api.openai.com/v1" }
  }
}
```

---

# 🔑 Configuration fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `vault` | `string` | ✅ | — | Absolute path to the Obsidian vault |
| `ai` | `object` | ❌ | — | AI provider settings |
| `ai.provider` | `string` | ❌ | `"ollama"` | `"ollama"` or `"openai"` |
| `ai.ollama.url` | `string` | if Ollama | `http://127.0.0.1:11434` | Ollama server URL |
| `ai.ollama.model` | `string` | if Ollama | `qwen2.5-coder:7b` | Ollama model |
| `ai.openai.apiKey` | `string` | if OpenAI | — | API key (or env var) |
| `ai.openai.model` | `string` | if OpenAI | `gpt-4o-mini` | Model id / slug |
| `ai.openai.baseUrl` | `string` | if OpenAI | `https://api.openai.com/v1` | API base URL |

---

# 🗂️ `vault`

Points to your Obsidian vault folder.

```json
{
  "vault": "D:\\Vault"
}
```

**Rules**

- Must be an **absolute path**.
- On Windows, escape backslashes (`D:\\Vault`) or use forward slashes (`D:/Vault`).
- Whitespace is **trimmed** automatically when read.
- A missing/empty vault is rejected with a descriptive error telling you to run `obs init`.

**Set it interactively**

```bash
obs init
# or
obs config set
```

---

# 🤖 AI configuration

The `ai` object selects the active provider.

```json
{
  "ai": { "provider": "ollama" }
}
```

| Setting | Valid values | Notes |
|---------|--------------|-------|
| `ai.provider` | `"ollama"` or `"openai"` | OpenRouter / LM Studio / compatible APIs use `"openai"` with a different `baseUrl` |
| `ai.ollama.url` | any URL | Trailing slashes stripped |
| `ai.ollama.model` | any Ollama model | Must be pulled: `ollama pull <model>` |
| `ai.openai.apiKey` | token | Optional if `OPENAI_API_KEY` is set; config takes priority |
| `ai.openai.model` | model id / slug | Exact slug needed for OpenRouter |
| `ai.openai.baseUrl` | API endpoint | See provider notes in [AI.md](AI.md) |

---

# 🚀 `obs init`

Sets the vault location for the first time.

**Syntax**

```
obs init
```

**Behavior**

1. Prompts for the vault path.
2. Trims whitespace.
3. Rejects empty paths.
4. Saves `config.json`.

```bash
obs init
```

```text
? Lokasi Obsidian Vault D:\Vault
✅ Vault berhasil disimpan.
```

---

# ⚙️ `obs config`

Manages configuration from the CLI.

**Syntax**

```
obs config [subcommand]
```

| Subcommand | Description |
|------------|-------------|
| *(none)* | Summary of current config |
| `show` | Full config (API key masked) |
| `set` | Update the vault path |
| `ai` | AI provider setup wizard |
| `reset` | Reset to defaults |

```bash
obs config
obs config show
obs config set
obs config ai
obs config reset
```

**Example output (`obs config`)**

```text
Current Configuration
----------------------
Vault   : D:\Vault
AI      : Ollama — qwen2.5-coder:7b
```

**Example output (`obs config show`)**

```json
{
  "vault": "D:\\Vault",
  "ai": {
    "provider": "openai",
    "openai": {
      "apiKey": "********abcd",
      "model": "gpt-4o-mini",
      "baseUrl": "https://api.openai.com/v1"
    }
  }
}
```

> Only the last 4 characters of the key are shown.

---

# 🛠️ `obs config ai`

Interactive AI provider wizard.

```bash
obs config ai
```

1. **Provider** — Ollama or OpenAI/API key.
2. **Ollama** — URL (`http://127.0.0.1:11434`) and model (`qwen2.5-coder:7b`).
3. **OpenAI** — API key (masked input `*`), model (`gpt-4o-mini`), base URL (`https://api.openai.com/v1`).

```text
✅ Konfigurasi AI berhasil disimpan.
```

---

# 🌿 Environment variables

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

# 🧾 Configuration examples

### Minimal — Ollama only

```json
{
  "vault": "D:\\Vault"
}
```

### Ollama (explicit)

```json
{
  "vault": "D:\\Vault",
  "ai": {
    "provider": "ollama",
    "ollama": { "url": "http://127.0.0.1:11434", "model": "qwen2.5-coder:7b" }
  }
}
```

### OpenAI

```json
{
  "vault": "D:\\Vault",
  "ai": {
    "provider": "openai",
    "openai": {
      "apiKey": "sk-...",
      "model": "gpt-4o-mini",
      "baseUrl": "https://api.openai.com/v1"
    }
  }
}
```

### Key via environment variable

```json
{
  "vault": "D:\\Vault",
  "ai": {
    "provider": "openai",
    "openai": { "model": "gpt-4o-mini", "baseUrl": "https://api.openai.com/v1" }
  }
}
```

### OpenRouter

```json
{
  "vault": "D:\\Vault",
  "ai": {
    "provider": "openai",
    "openai": {
      "apiKey": "sk-or-...",
      "model": "anthropic/claude-3.5-sonnet",
      "baseUrl": "https://openrouter.ai/api/v1"
    }
  }
}
```

### LM Studio (local, OpenAI-compatible)

```json
{
  "vault": "D:\\Vault",
  "ai": {
    "provider": "openai",
    "openai": {
      "apiKey": "lm-studio",
      "model": "qwen2.5-7b-instruct",
      "baseUrl": "http://localhost:1234/v1"
    }
  }
}
```

---

# ⚠️ Common mistakes

1. **Unescaped backslashes** on Windows: use `D:\\Vault` (not `D:\Vault`).
2. **Trailing spaces** in the vault path — trimmed automatically, but avoid them.
3. **Forgetting `obs init`** — commands fail with a clear "Vault is not configured" error.
4. **Committing real API keys** — use `OPENAI_API_KEY` or `.gitignore`.
5. **Wrong `ai.provider`** — only `"ollama"` or `"openai"` are valid.
6. **Wrong model slug** for OpenRouter / LM Studio — a `404` usually means a wrong model name.
7. **Stale `apiKey`** in config — it overrides `OPENAI_API_KEY`.

---

# 🔧 Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `No configuration found. Run obs init first.` | `config.json` missing/invalid | Run `obs init` |
| `Invalid path.` | Path does not exist | Use a valid absolute path |
| `Provider AI tidak dikenal` | Bad `ai.provider` | Re-run `obs config ai` |
| `Belum ada API key...` | No key configured | `obs config ai` or set `OPENAI_API_KEY` |
| `Gagal connect ke Ollama` | Ollama not running / wrong URL | `ollama serve`; check URL |
| Commands use wrong vault | Wrong path stored | `obs config show` → `obs config set` |

---

For AI provider details, see [AI.md](AI.md).
