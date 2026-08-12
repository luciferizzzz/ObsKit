# 🛣️ Roadmap — ObsKit

The long-term plan for **ObsKit** (OBS = Organized Knowledge System): completed versions, planned releases, guiding principles, and the vision for the future.

> **Related docs:** [ARCHITECTURE.md](ARCHITECTURE.md) · [CHANGELOG.md](../CHANGELOG.md) · [README.md](../README.md)

---

## 📋 Table of Contents

- [Completed versions](#-completed-versions)
- [Planned versions](#-planned-versions)
- [Long-term vision](#-long-term-vision)
- [Guiding principles](#-guiding-principles)
- [Planned AI evolution](#-planned-ai-evolution)

---

# ✅ Completed Versions

## v1.0 — Initial Release

> **2026-07-30**

Core note management.

- ✅ `obs new` — new notes
- ✅ `obs today` — daily notes
- ✅ `obs find` — find notes
- ✅ `obs rename` — rename notes
- ✅ `obs move` — move notes
- ✅ `obs open` — open notes
- ✅ `obs stats` — vault statistics
- ✅ Template system (`-t`)
- ✅ `obs deadlinks` — dead link detection
- ✅ `obs doctor` — vault doctor

---

## v1.1 — Exploration

> **2026-07-31**

- ✅ `obs list` — list notes
- ✅ `obs tree` — tree view
- ✅ `obs recent` — recent notes
- ✅ `obs random` — random note
- ✅ `obs config` — configuration management

---

## v1.2 — Knowledge

> **2026-08-01**

- ✅ `obs backlinks`
- ✅ `obs orphan` — orphan notes
- ✅ `obs graph` — graph analysis
- ✅ `obs tags` — tag extraction

---

## v1.2.1 — AI Integration

> **2026-08-02**

- ✅ AI note generation (`obs ai`)
- ✅ Interactive daily journal (`obs ai --ask --daily`)
- ✅ Direct file writing (`obs ai --file`)
- ✅ Daily note integration (`obs ai --daily`)

---

## v1.2.2 — AI Polish

> **2026-08-02**

- ✅ Better `--ask` mode (deeper questions)
- ✅ Better template insertion
- ✅ Smarter daily note updates

---

## v1.3.0 — Productivity

> **2026-08-03**

- ✅ `obs dashboard`
- ✅ `obs report`
- ✅ `obs todo`
- ✅ `obs attachments`
- ✅ `obs backup`
- ✅ `obs archive`
- ✅ `obs cleanup`
- ✅ Markdown / HTML / JSON export

---

## v1.3.1 — Bug Fix

> **2026-08-03**

- ✅ AI daily note section parsing
- ✅ Fallback insertion
- ✅ Section detection

---

## v1.4.0 — AI Providers

> **2026-08-04**

- ✅ OpenAI provider
- ✅ OpenRouter support
- ✅ OpenAI-compatible APIs
- ✅ `obs config ai`
- ✅ `OPENAI_API_KEY` environment variable
- ✅ Unified AI provider architecture

---

## v1.4.1 — Export + Bug Fix

> **2026-08-04**

- ✅ Markdown / HTML / JSON report export
- ✅ Custom export path (`-o`)
- ✅ Windows CRLF compatibility
- ✅ Section matching improvements

---

## v1.4.2 — Daily Note Fix

> **2026-08-05**

- ✅ Mood section
- ✅ Gratitude (Syukur) section
- ✅ Reflection (Refleksi) section
- ✅ Auto-create missing sections

---

## v1.4.3 — Template System

> **2026-08-05**

- ✅ New templates: Meeting, Project, Article, Journal, Idea, People
- ✅ Improved: Daily, Book, HTML, CSS, JS
- ✅ AI-aware placeholders (`{{ai:...}}`)

---

## v1.4.4 — AI Productivity

> **2026-08-06**

- ✅ `obs ai tomorrow`
- ✅ `obs ai update`
- ✅ `obs ai weekly`
- ✅ Interactive planning sessions
- ✅ Vault path trimming / validation

---

## v1.4.5 — Filename Sanitization

> **2026-08-06**

- ✅ Shared filename sanitization utility
- ✅ Illegal Windows characters removed
- ✅ Unicode and emoji preserved
- ✅ Always-valid `.md` extension

---

# 🚧 Planned Versions

## v1.5 — Interactive Experience

Focus: interactive terminal experience, relationship management, and better navigation.

- ✅ **Relationship Management** — `obs relate`, `obs unrelate`, `obs relations`
  - ✅ Reusable relationship module (`utils/relationship/`) as the foundation for graph, AI links, and knowledge exploration
  - ✅ Related-section management with duplicate prevention, alias/heading parsing, and CRLF-preserving Markdown writes
- ✅ **Daily Workflow** — `obs ai update` imports the previous daily note's `## Tomorrow` checklist items into today's `## Update` section
  - ✅ Reusable daily workflow module (`utils/dailyWorkflow.js`) with date resolution, section extraction, checklist parsing/dedup, and idempotent upsert
- ✅ **Search Foundation** — reusable filename search (`utils/search.js`) that powers `obs find` and is the base for future content search, ranking, filters, and fuzzy search (fuzzy search itself remains planned)
- ✅ **AI Persona Foundation** — reusable persona definitions (`utils/persona.js`) with `-p, --persona <name>` support across all `obs ai` workflows
- ✅ **People Interaction Workflow** — `obs ai people <name>` structures and appends new interactions to an existing People note's `## Catatan Interaksi` section (preview + confirmation, duplicate prevention, CRLF-safe writes)
- **Interactive Mode** — launch a full terminal interface (`obs` with a menu)
- **Better Navigation** — keyboard-driven browsing of notes and folders
- **Colored Output** — color-coded terminal output
- **Shell Autocomplete** — complete `obs` commands and note names
- **Fuzzy Search** — typo-tolerant note search

## v1.6 — Intelligence

Focus: deeper knowledge management.

- **Relationship Suggestions** — discover related notes by shared links and tags
- **Graph Improvements** — richer relationship analysis and suggestions
- **Watch Mode** — monitor vault changes automatically
- **Search by Content** — search inside note contents, not just filenames

## v1.7 — Multi-Vault Foundation

Focus: prepare for power-user workflows.

- **Multi-Vault Support** — switch between multiple vaults
- **Workspace Profiles** — per-vault preferences and layouts
- **Plugin System** — install third-party commands as plugins
- **Performance** — faster scanning on large vaults

## v2.0 — Power User

Focus: multi-vault, automation, and extensibility.

- **Multi Vault** (complete) — profiles, per-vault configuration
- **Workspace Profiles** (complete)
- **Git Integration** — version control for the vault
- **Automation** — scriptable commands, non-interactive mode, hooks
- **Plugin System** (complete) — registry and simple install flow
- **REST API** — HTTP access to the vault

## v2.1 — Platform Expansion

Focus: web and cloud.

- **Web Dashboard** — browser-based vault dashboard
- **Cloud Backup** — automatic cloud backup and restore
- **Advanced Reporting** — richer reports and analytics
- **Mobile-Friendly Output** — structured machine-readable output

## v3.0 — Knowledge Platform

Focus: complete knowledge-management platform.

- **Terminal UI** — full, rich TUI
- **REST API** (production-ready)
- **Web Dashboard** (production-ready)
- **Cloud Backup** (production-ready)
- **Plugin Marketplace** — community plugins
- **AI Ecosystem** — deep AI integration across the platform
- **MCP Server** — Model Context Protocol server so AI tools can interact with the vault natively

---

# 🌌 Long-term Vision

ObsKit aims to become the **definitive command-line toolkit for Markdown knowledge management** — fully compatible with Obsidian vaults — and eventually a full knowledge-management platform.

The journey:

1. **Terminal-first note management** — everything you do daily in Obsidian, from the CLI.
2. **Intelligent knowledge tools** — graph analysis, orphans, backlinks, AI-assisted writing.
3. **Interactive experience** — a polished, keyboard-driven TUI with autocomplete and fuzzy search.
4. **Multi-vault & automation** — profiles, scripting, and plugins for power users.
5. **Platform** — REST API, web dashboard, cloud backup, and MCP integration that lets any AI tool talk to your vault.

**The end goal:** a single, fast, open-source layer that manages, analyzes, and augments your knowledge — whether you are in the terminal, the browser, or an AI assistant.

---

# 🧭 Guiding Principles

These principles shape every roadmap decision:

- **Fast and lightweight** — no bloat; performance is a feature.
- **Terminal-first** — the CLI is the primary interface.
- **Safe by default** — the user's notes are never corrupted or lost.
- **Reusable architecture** — small commands, shared utilities, easy to extend.
- **Cross-platform** — Windows, Linux, and macOS.
- **Open and community-driven** — contributions and feedback shape the roadmap.
- **AI as an enhancer, not a replacement** — AI augments workflows but the user stays in control.

---

# 🤖 Planned AI Evolution

| Version | AI capability |
|---------|---------------|
| v1.2.1 – v1.4.4 | Note generation, daily journal, tomorrow/update/weekly planning, template filling |
| v1.5 | AI-powered fuzzy search and note suggestions |
| v1.6 | Relationship suggestions, AI tagging, AI summaries |
| v2.0 | Scriptable AI, batch processing, AI-powered organization |
| v3.0 | **AI Ecosystem** — writing, linking, summarization, and more; **MCP server** so any AI tool can access the vault |

The AI module is designed to grow: new providers, new workflows, and deeper integration with the vault graph — all through the same unified `utils/ai.js` interface (see [ARCHITECTURE.md](ARCHITECTURE.md)).
