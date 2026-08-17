# 📚 ObsKit

<p align="center">

**OBS = Organized Knowledge System**

A fast, lightweight, open-source CLI toolkit for managing Markdown knowledge bases directly from the terminal.

No more opening a GUI just to create, rename, move, search, or organize notes.

Built for developers, students, writers, researchers, and terminal enthusiasts.

</p>

<p align="center">

![Version](https://img.shields.io/badge/version-v1.5.2-blue)
![Node](https://img.shields.io/badge/node-18+-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)
![License](https://img.shields.io/badge/license-MIT-yellow)
![Open Source](https://img.shields.io/badge/Open%20Source-❤-red)

</p>

---

> **Independent Community Project**
>
> ObsKit is an independent open-source project.
>
> **OBS** stands for **Organized Knowledge System** — it does **not** stand for Obsidian.
>
> ObsKit is **not affiliated with, endorsed by, or sponsored by Obsidian** or its developers.

---

# ✨ Why ObsKit?

Managing notes shouldn't require opening a GUI every few minutes.

Instead of:

```
Open App
↓
Find Folder
↓
Create Note
↓
Rename
↓
Move
↓
Close App
```

Just type:

```bash
obs new Notes "Learning Rust"
```

Done.

ObsKit lets you manage your entire Markdown knowledge base directly from your terminal.

---

# 📖 Introduction

ObsKit is an **independent Markdown knowledge management toolkit**.

It manages Markdown files **directly through the filesystem**.

- ✅ Fully compatible with Obsidian vaults.
- ✅ Does **not** communicate with the Obsidian application.
- ✅ Does **not** rely on proprietary Obsidian APIs.
- ✅ Multiple applications can safely work with the same Markdown vault.

**Conceptually**

```text
Markdown Files
        ▲
        │
 ┌──────┼─────────┐
 │      │         │
 ▼      ▼         ▼
Obsidian  ObsKit  VS Code
```

Obsidian stores notes as standard Markdown files — that is why ObsKit works with Obsidian vaults. No proprietary integration is involved.

---

# 🎬 Preview

> *(GIFs or screenshots here)*

```bash
obs new Notes "JavaScript Closures"

✔ Created:
Vault/
└── Notes/
    └── JavaScript Closures.md
```

---

# 🚀 Features

ObsKit is a **modular toolkit** — small commands backed by reusable utilities.

## 📝 Note Management

- Create Notes
- Daily Notes
- Rename Notes
- Move Notes
- Open Notes
- Recent Notes
- Random Notes

---

## 📂 Vault Management

- Dashboard
- Statistics
- Tree View
- Backup
- Cleanup
- Archive
- Export Reports

---

## 🔗 Knowledge Management

- Find Notes
- Backlinks
- Wiki Links
- Dead Links
- Vault Doctor
- Graph Analysis
- Relationships (`obs relate` / `obs unrelate` / `obs relations`)
- Tags

---

## 👥 People Management

- List People Notes (`obs people list`)
- Recent People Notes (`obs people recent`)
- People Statistics (`obs people stats`)

---

## 🤖 AI

Supports **local** and **cloud** AI.

### Providers

✅ Ollama

✅ OpenAI

✅ OpenRouter

✅ LM Studio

✅ Any OpenAI-compatible API

### Capabilities

- Generate Notes
- Update Notes
- Fill Templates
- Better Templates (standardized placeholders & layouts, improved People template)
- Daily Journal
- Tomorrow Planning
- Weekly Planning
- Direct File Writing

---

# 📦 Installation

```bash
git clone https://github.com/luciferizzzz/obskit.git

cd obskit

npm install

npm link
```

The CLI executable is `obs`.

---

# ⚙️ Requirements

- **Node.js 18+** (uses modern features like `fetch` and `AbortController`).
- **npm** for installation.
- A Markdown knowledge vault (for example, an Obsidian vault) on your filesystem.

---

# 🛠️ Configuration

ObsKit reads a single **`config.json`** in the project root.

| Setting | Purpose |
|---------|---------|
| `vault` | Absolute path to your Markdown vault |
| `ai` | AI provider settings (Ollama / OpenAI) |

Initialize the vault path:

```bash
obs init
```

> **Required.** ObsKit must know your vault before any vault command can run.
> `obs init` saves the path to `config.json`. Without it, commands fail with a clear
> `Vault is not configured` error (run `obs init` to fix).

Manage configuration:

```bash
obs config
obs config show
obs config set
obs config ai
obs config reset
```

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for the full reference.

---

# ⚡ Quick Start

Create your first note

```bash
obs new Notes "Learning Rust"
```

Find notes

```bash
obs find rust
```

Generate AI content

```bash
obs ai "Explain Rust ownership"
```

---

# 📖 Documentation

Documentation is split into dedicated files.

| Document | Description |
|----------|-------------|
| [docs/AI.md](docs/AI.md) | AI setup, providers & workflows |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Internal architecture |
| [docs/COMMANDS.md](docs/COMMANDS.md) | All available commands |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Configuration guide |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Contribution guidelines |
| [docs/FAQ.md](docs/FAQ.md) | Frequently asked questions |
| [docs/RELATIONSHIPS.md](docs/RELATIONSHIPS.md) | Relationship system & module |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Future development |
| [docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md) | Template system |
| [docs/TEMPLATE_AUDIT.md](docs/TEMPLATE_AUDIT.md) | v1.5.1 template audit report |
| CHANGELOG.md | Release history |

---

# 🏗 Architecture

```
CLI
 │
 ▼
Commands
 │
 ▼
Utilities
 │
 ▼
Checks
 │
 ▼
Vault
```

Small commands.

Reusable utilities.

Easy to extend.

---

# 📁 Project Structure

```
obskit/

bin/
commands/
checks/
docs/
templates/
test/
utils/

README.md
CHANGELOG.md
LICENSE
```

---

# 🛣 Roadmap

## ✨ v1.5.2 — People Management

- ✅ `obs people list` — list all People notes
- ✅ `obs people recent` — most recently modified People notes
- ✅ `obs people stats` — People note statistics
- ✅ Improved AI workflows (tomorrow, daily, weekly, people)

---

## ✨ v1.5.1 — Better Templates

- ✅ Better placeholders
- ✅ Cleaner layouts
- ✅ Improved People template
- ✅ Better AI compatibility
- ✅ More consistent formatting

---

## 🚧 v1.5

- ✅ Relationship Management
- ✅ Search Experience — fuzzy search, content search, ranking, filters, interactive pick
- ✅ Colored Output
- ✅ Shell Autocomplete (`obs completion <shell>`)
- Interactive Terminal UI
- Better Navigation

---

## 🚀 v2

- Multi Vault
- Workspace Profiles
- Git Integration
- Automation

---

## 🌌 v3

Transform ObsKit into a complete knowledge management platform.

- Terminal UI
- REST API
- Web Dashboard
- Plugin Marketplace
- AI Ecosystem
- MCP Integration

---

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a branch
3. Commit changes
4. Open a Pull Request

Bug reports and feature requests are always appreciated.

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for the full contribution guide.

---

# ⭐ Support

If ObsKit improves your workflow, consider giving the project a ⭐.

Every star helps the project reach more users and motivates future development.

---

# 📄 License

Released under the **MIT License**.

See the **LICENSE** file for details.

---

## Disclaimer

ObsKit is an independent community project.

OBS stands for **Organized Knowledge System**.

ObsKit is **not affiliated with, endorsed by, sponsored by, or officially associated with Obsidian or Dynalist Inc.**

ObsKit works directly with user-owned Markdown files stored in Markdown knowledge vaults, including Obsidian vaults.

It does **not** include, modify, distribute, reverse engineer, or rely on proprietary Obsidian source code, assets, internal APIs, or proprietary components.

Compatibility with Obsidian exists because Obsidian stores notes as standard Markdown files.

Obsidian® is a registered trademark of Dynalist Inc.

All trademarks, product names, and logos are the property of their respective owners.
