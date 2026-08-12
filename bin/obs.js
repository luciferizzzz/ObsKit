#!/usr/bin/env node

const { default: chalk } = require("chalk");

const { Command } = require("commander");

const { Option } = require("commander");

const program = new Command();

const doctor = require("../commands/doctor");

const deadlinks = require("../commands/deadlinks");

const move = require("../commands/move");

const stats = require("../commands/stats")

const open = require("../commands/open");

const rename = require("../commands/rename");

const find = require("../commands/find");

const today = require("../commands/today");

const init = require("../commands/init");

const newNote = require("../commands/new");

const list = require("../commands/list");

const tree = require("../commands/tree");

const recent = require("../commands/recent");

const random = require("../commands/random");

const backlinks = require("../commands/backlinks");

const orphan = require("../commands/orphan");

const graph = require("../commands/graph");

const tags = require("../commands/tags");

const configCmd = require("../commands/config");

const { aiWrite, aiTomorrow, aiUpdate, aiWeekly, aiPeople } = require("../commands/ai");

const dashboard = require("../commands/dashboard");

const report = require("../commands/report");

const todo = require("../commands/todo");

const attachments = require("../commands/attachments");

const backup = require("../commands/backup");

const archive = require("../commands/archive");

const templateCmd = require("../commands/template");

const cleanup = require("../commands/cleanup");

const relate = require("../commands/relate");

const unrelate = require("../commands/unrelate");

const relations = require("../commands/relations");

program
  .name("obs")
  .description("ObsKit CLI — Organized Knowledge System")
  .version("1.4.6");

program
  .command("hello")
  .description("Test command")
  .action(() => {
    console.log("Hello from ObsKit 🚀");
  });

program
  .command("init")
  .description("Set lokasi obsidian vault")
  .action(init)

program
  .command("new <folder> <title>")
  .description("Membuat note baru")
  .addOption(
    new Option("-t, --template <name>", "Gunakan template")
  )
  .action((folder, title, options) =>{
    newNote(folder, title, options);
  });

program
  .command("today")
  .description("Membuat daily note")
  .action(today);

program
  .command("find <keywords>")
  .description("Cari note")
  .action(find);

program
  .command("rename <folder> <oldName> <newName>")
  .description("Mengubah nama note")
  .action(rename);

program
  .command("open <keyword>")
  .description("Membuka note")
  .action(open);

program
  .command("stats")
  .description("Menampilkan statistik vault")
  .action(stats);

program
  .command("list")
  .description("Menampilkan semua note dalam vault")
  .action(list);

program
  .command("move <sourceFolder> <title> <targetFolder>")
  .description("Memindahkan note")
  .action(move);

program
  .command("deadlinks")
  .description("Check broken wiki links")
  .action(deadlinks);

program
  .command("backlinks <note>")
  .description("Find notes that reference a given note via wiki links")
  .action(backlinks);

program
  .command("orphan")
  .description("Find notes with no incoming wiki links")
  .action(orphan);

program
  .command("graph")
  .description("Display vault graph analysis with link relationships")
  .action(graph);

program
  .command("tags")
  .description("Extract and display tags from all notes")
  .action(tags);

program
  .command("doctor")
  .description("Analyze vault health")
  .action(doctor);

program
  .command("tree")
  .description("Menampilkan struktur folder vault")
  .action(tree);

program
  .command("recent [limit]")
  .description("Menampilkan note yang baru dimodifikasi")
  .action(recent);

program
  .command("random")
  .description("Pilih note secara acak")
  .option("--open", "Buka note yang dipilih")
  .action(random);

program
  .command("config [subcommand]")
  .description("Manage configuration (show, set vault, ai, reset)")
  .action(configCmd);

program
  .command("ai [prompt] [name]")
  .description("Bikin catatan pake AI (Ollama lokal atau OpenAI API key)")
  .option("-t, --title <title>", "Judul catatan", "AI Note")
  .option("-f, --folder <folder>", "Folder di vault", "AI")
  .option("--file <path>", "Path file langsung (relative dari vault atau absolute)")
  .option("--daily", "Catat ke daily note hari ini")
  .option("--ask", "Interactive mode - AI tanya kamu dulu")
  .option("--template <name>", "Gunakan template untuk catatan AI")
  .option("-p, --persona <name>", "Persona AI yang dipakai")
  .action((prompt, name, options) => {
    if (prompt === "tomorrow") {
      return aiTomorrow(options);
    }
    if (prompt === "update") {
      return aiUpdate(options);
    }
    if (prompt === "weekly") {
      return aiWeekly(options);
    }
    if (prompt === "people") {
      return aiPeople(name, options);
    }
    return aiWrite(prompt, options);
  });

program
  .command("dashboard")
  .description("Ringkasan aktivitas vault hari ini")
  .action(dashboard);

program
  .command("report")
  .description("Laporan vault terperinci")
  .option("--markdown", "Export laporan ke file markdown")
  .option("--html", "Export laporan ke file HTML")
  .option("--json", "Export laporan ke file JSON")
  .option("-o, --output <path>", "Path file output untuk export")
  .action(report);

program
  .command("todo")
  .description("Scan semua todo list di vault")
  .action(todo);

program
  .command("attachments")
  .description("Inspect attachment files di vault")
  .action(attachments);

program
  .command("backup")
  .description("Backup seluruh vault ke folder tujuan")
  .action(backup);

program
  .command("archive [days]")
  .description("Archive note yang lama ke folder Archive")
  .action(archive);

program
   .command("cleanup")
   .description("Cleanup vault (empty files, orphan notes, broken links)")
   .action(cleanup);

program
  .command("template")
  .description("Kelola template catatan")
  .option("--list", "Daftar semua template yang tersedia")
  .option("--preview <name>", "Preview isi template")
  .action(templateCmd);

program
  .command("relate <note> <related>")
  .description("Add a related note to the Related section")
  .action(relate);

program
  .command("unrelate <note> <related>")
  .description("Remove a related note from the Related section")
  .action(unrelate);

program
  .command("relations <note>")
  .description("Show relationships for a note (related, backlinks, outgoing)")
  .action(relations);

program.parseAsync(process.argv).catch((err) => {
    console.error(chalk.red(`\n❌ ${err.message}`));
    process.exit(1);
});
