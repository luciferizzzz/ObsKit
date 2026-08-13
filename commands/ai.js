const path = require("path");
const fs = require("fs");
const { input, confirm } = require("@inquirer/prompts");
const { generate } = require("../utils/ai");
const { resolvePersona } = require("../utils/persona");
const { createFile } = require("../utils/file");
const { sanitizeFilename, mdFileName } = require("../utils/sanitizeFilename");
const { getVaultPath } = require("../utils/vault");
const { scanMarkdownFiles } = require("../utils/scanner");
const { error, success, warning } = require("../utils/feedback");
const { Spinner } = require("../utils/spinner");
const c = require("../utils/colors");
const { parseTemplate, extractAIBlocks, fillAIBlocks, getTemplateData } = require("../utils/markdown");
const { loadTomorrowTasks, importTomorrowTasks } = require("../utils/dailyWorkflow");
const { updateMarkdown } = require("../utils/relationship/editor");
const {
    findPeopleNote,
    readPeopleNote,
    parseInteractionOutput,
    appendInteraction,
    buildInteractionPrompt,
    INTERACTIONS_HEADING,
} = require("../utils/people");

async function askUser() {
    const answers = {};

    console.log("\n📝 Oke, kita isi daily note dulu ya!\n");

    answers.target = await input({
        message: "🎯 Target hari ini apa aja?",
    });

    answers.selesai = await input({
        message: "✅ Dari target tadi, udah selesai semua?",
    });

    answers.pelajaran = await input({
        message: "📚 Hari ini kamu belajar atau kerjain apa aja?",
    });

    answers.cerita = await input({
        message: "✨ Ada yang menarik atau memorable?",
    });

    answers.mood = await input({
        message: "😊 Gimana hari ini secara overall?",
    });

    answers.syukur = await input({
        message: "🙏 Ada hal yang kamu syukuri hari ini?",
    });

    answers.refleksi = await input({
        message: "💭 Ada pelajaran atau refleksi buat hari ini?",
    });

    return answers;
}

function buildPromptFromAnswers(answers, persona) {
    return `${persona.system}

Buat 6 bagian untuk daily note hari ini dengan heading:
## Target Hari Ini
## Catatan
## Selesai
## Mood
## Syukur
## Refleksi

Target: ${answers.target}
Kegiatan: ${answers.pelajaran}
Cerita: ${answers.cerita}
Mood: ${answers.mood}
Syukur: ${answers.syukur}
Refleksi: ${answers.refleksi}
Yang udah selesai: ${answers.selesai}

Tiap bagian langsung isinya aja, bahasa santai, masing-masing 2-3 kalimat.
JANGAN pakai kata "kamu", "anda", "kalian".
JANGAN pembukaan kayak "Tentu", "Oke", "Baik".`;
}

function formatDate(d) {
    return (
        `${d.getFullYear()}-` +
        `${String(d.getMonth() + 1).padStart(2, "0")}-` +
        `${String(d.getDate()).padStart(2, "0")}`
    );
}

function getISOWeek(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function handleAiError(err) {
    const msg = err.message || "Unknown error";
    if (msg.includes("connect ke Ollama") || msg.includes("ECONNREFUSED")) {
        error("Ollama belum jalan. Jalankan `ollama serve` dulu.");
    } else if (msg.includes("API key")) {
        error(msg);
    } else if (msg.includes("timeout")) {
        error("Response timeout. Coba prompt yang lebih pendek.");
    } else {
        error(msg);
    }
}

async function generateWithSpinner(prompt, message = "AI sedang memproses...") {
    const spinner = new Spinner({ text: message });
    const quiet = !spinner.enabled;
    if (quiet) console.log(`\n🧠 ${message}...\n`);
    spinner.start();
    try {
        const content = await generate(prompt);
        spinner.stop();
        return content;
    } catch (err) {
        spinner.stop();
        throw err;
    }
}

function uniquePath(filePath) {
    if (!fs.existsSync(filePath)) return filePath;
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    let i = 2;
    while (fs.existsSync(path.join(dir, `${base} ${i}${ext}`))) i++;
    return path.join(dir, `${base} ${i}${ext}`);
}

function insertUnderCatatan(content, newContent) {
    const clean = newContent.replace(/^## Catatan\s*(?:\r?\n)*/i, "").trim();

    const placeholderRe = /(## Catatan(?:\r?\n)+)-((?:\r?\n)*)(?=(?:\r?\n)+---|(?:\r?\n)+## |$)/i;
    if (placeholderRe.test(content)) {
        return content.replace(placeholderRe, `$1${clean}$2`);
    }

    const sectionRe = /(## Catatan(?:\r?\n)+)([\s\S]*?)(?=(?:\r?\n)+---|(?:\r?\n)+## |\r?\n?$)/i;
    const m = content.match(sectionRe);
    if (m) {
        const body = m[2].trim();
        if (body && body !== "-") {
            return content.replace(sectionRe, `${m[1]}${body}\n\n${clean}`);
        } else {
            return content.replace(sectionRe, `${m[1]}${clean}`);
        }
    }

    return content + `\n\n${clean}`;
}

function replaceSection(content, heading, newContent) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
        `(${escaped}(?:\\r?\\n)+)([\\s\\S]*?)(?=(?:\\r?\\n)+---|(?:\\r?\\n)+## |\\r?\\n?$)`,
        "i"
    );
    if (re.test(content)) {
        return content.replace(re, `$1${newContent.trim()}`);
    }
    return content;
}

function parseSections(aiContent) {
    const content = aiContent.replace(/\r\n/g, "\n");
    const sections = {};
    const titles = {
        target: /^[ \t]*(?:#{1,6}[ \t]+)?\*{0,2}[ \t]*Target Hari Ini[ \t]*:?[ \t]*\*{0,2}[ \t]*$/im,
        catatan: /^[ \t]*(?:#{1,6}[ \t]+)?\*{0,2}[ \t]*Catatan[ \t]*:?[ \t]*\*{0,2}[ \t]*$/im,
        selesai: /^[ \t]*(?:#{1,6}[ \t]+)?\*{0,2}[ \t]*Selesai[ \t]*:?[ \t]*\*{0,2}[ \t]*$/im,
        mood: /^[ \t]*(?:#{1,6}[ \t]+)?\*{0,2}[ \t]*Mood[ \t]*:?[ \t]*\*{0,2}[ \t]*$/im,
        syukur: /^[ \t]*(?:#{1,6}[ \t]+)?\*{0,2}[ \t]*Syukur[ \t]*:?[ \t]*\*{0,2}[ \t]*$/im,
        refleksi: /^[ \t]*(?:#{1,6}[ \t]+)?\*{0,2}[ \t]*Refleksi[ \t]*:?[ \t]*\*{0,2}[ \t]*$/im,
    };

    const buffers = { target: [], catatan: [], selesai: [], mood: [], syukur: [], refleksi: [] };
    let currentKey = null;

    for (const line of content.split("\n")) {
        let matched = null;
        for (const [key, re] of Object.entries(titles)) {
            if (re.test(line)) {
                matched = key;
                break;
            }
        }
        if (matched) {
            currentKey = matched;
            continue;
        }
        if (currentKey) {
            buffers[currentKey].push(line);
        }
    }

    for (const [key, buf] of Object.entries(buffers)) {
        const body = buf.join("\n").trim();
        if (body) sections[key] = body;
    }
    return sections;
}

function fillDailyTemplate(template, sections) {
    let result = template;
    const map = {
        target: "## Target Hari Ini",
        catatan: "## Catatan",
        selesai: "## Selesai",
        mood: "## Mood",
        syukur: "## Syukur",
        refleksi: "## Refleksi",
    };
    const found = new Set();
    for (const [key, heading] of Object.entries(map)) {
        if (sections[key]) {
            const replaced = replaceSection(result, heading, sections[key]);
            if (replaced !== result) {
                result = replaced;
                found.add(key);
            }
        }
    }
    for (const [key, heading] of Object.entries(map)) {
        if (sections[key] && !found.has(key)) {
            const jamRe = /\n*Jam dibuat[^\n]*\n?$/;
            if (jamRe.test(result)) {
                result = result.replace(jamRe, `\n\n${heading}\n\n${sections[key]}$&`);
            } else {
                result = result.replace(/\s*$/, `\n\n${heading}\n\n${sections[key]}\n`);
            }
        }
    }
    return result;
}

async function fillTemplateWithAI(template, prompt, options, persona) {
    const aiBlocks = extractAIBlocks(template);

    if (aiBlocks.length === 0) {
        return null;
    }

    console.log(`\n🤖 Template memiliki ${aiBlocks.length} bagian AI, mengisi...`);

    const fills = [];

    for (let i = 0; i < aiBlocks.length; i++) {
        const block = aiBlocks[i];
        console.log(`  [${i + 1}/${aiBlocks.length}] ${block.instruction}`);

        const blockPrompt = `${persona.system}

${block.instruction}

Konteks tambahan: ${prompt}

Berikan jawaban langsung, tanpa pembukaan.`;

        try {
            const content = await generate(blockPrompt);
            fills.push({ placeholder: block.placeholder, content: content.trim() });
        } catch (err) {
            console.log(`  ❌ Gagal mengisi blok: ${err.message}`);
            fills.push({ placeholder: block.placeholder, content: "" });
        }
    }

    return fillAIBlocks(template, fills);
}

async function aiWrite(prompt, options) {
    const persona = resolvePersona(options.persona);

    let finalPrompt;

    if (options.ask) {
        const answers = await askUser();
        finalPrompt = buildPromptFromAnswers(answers, persona);
    } else {
        finalPrompt = `${persona.system}\n\nBuatkan catatan tentang: ${prompt}`;
    }

    try {
        const vault = getVaultPath();
        let filePath;

        if (options.daily) {
            const now = new Date();
            const date =
                `${now.getFullYear()}-` +
                `${String(now.getMonth() + 1).padStart(2, "0")}-` +
                `${String(now.getDate()).padStart(2, "0")}`;
            filePath = path.join(vault, "Daily Notes", `${date}.md`);

            const content = await generateWithSpinner(finalPrompt);

            if (options.ask) {
                const templatePath = path.join(
                    __dirname, "..", "templates", "daily.md"
                );
                let template = `# ${date}\n\n`;
                if (fs.existsSync(templatePath)) {
                    template = parseTemplate(
                        fs.readFileSync(templatePath, "utf8"),
                        getTemplateData({ title: date, folder: "Daily Notes", date })
                    );
                }

                const sections = parseSections(content);
                let filled = fillDailyTemplate(template, sections);
                if (filled === template) {
                    filled = insertUnderCatatan(template, content);
                }

                if (fs.existsSync(filePath)) {
                    const existing = fs.readFileSync(filePath, "utf8");
                    let updated = fillDailyTemplate(existing, sections);
                    if (updated === existing) {
                        updated = insertUnderCatatan(existing, content);
                    }
                    fs.writeFileSync(filePath, updated);
                    success("Daily note diupdate!");
                } else {
                    createFile(filePath, filled);
                    success("Daily note baru dibuat!");
                }
            } else {
                if (fs.existsSync(filePath)) {
                    const existing = fs.readFileSync(filePath, "utf8");
                    const updated = insertUnderCatatan(existing, content);
                    fs.writeFileSync(filePath, updated);
                    success("Catatan ditambahin ke daily note hari ini!");
                } else {
                    const templatePath = path.join(
                        __dirname, "..", "templates", "daily.md"
                    );
                    let header = `# ${date}\n\n`;
                    if (fs.existsSync(templatePath)) {
                        header = parseTemplate(
                            fs.readFileSync(templatePath, "utf8"),
                            getTemplateData({ title: date, folder: "Daily Notes", date })
                        );
                    }
                    const finalContent = insertUnderCatatan(header, content);
                    createFile(filePath, finalContent);
                    success("Daily note baru dibuat!");
                }
            }
        } else if (options.template) {
            const templatePath = path.join(
                __dirname, "..", "templates", `${options.template}.md`
            );

            if (!fs.existsSync(templatePath)) {
                error(`Template tidak ditemukan: ${options.template}`);
                return;
            }

            const title = sanitizeFilename(options.title || "AI Note");
            const folder = options.folder || "AI";

            let template = fs.readFileSync(templatePath, "utf8");
            template = parseTemplate(template, getTemplateData({ title, folder }));

            const filledTemplate = await fillTemplateWithAI(template, prompt, options, persona);

            if (filledTemplate) {
                filePath = uniquePath(path.join(vault, folder, mdFileName(title)));
                createFile(filePath, filledTemplate);
                success("Catatan dari template berhasil dibuat!");
            } else {
                const content = await generateWithSpinner(finalPrompt);
                filePath = uniquePath(path.join(vault, folder, mdFileName(title)));
                createFile(filePath, content);
                success("Catatan berhasil dibuat!");
            }
        } else if (options.file) {
            const content = await generateWithSpinner(finalPrompt);
            filePath = path.isAbsolute(options.file)
                ? options.file
                : path.join(vault, options.file);
            createFile(filePath, content);
            success("Catatan berhasil dibuat!");
        } else {
            const content = await generateWithSpinner(finalPrompt);
            const title = sanitizeFilename(options.title || "AI Note");
            const folder = options.folder || "AI";
            filePath = uniquePath(path.join(vault, folder, mdFileName(title)));
            createFile(filePath, content);
            success("Catatan berhasil dibuat!");
        }

        console.log(`📁 ${c.path(filePath)}`);
    } catch (err) {
        handleAiError(err);
    }
}

async function askTomorrow() {
    const answers = {};

    console.log("\n🗓️  Oke, kita rencanain hari besok!\n");

    answers.prioritas = await input({
        message: "🎯 Prioritas terbesar besok apa?",
    });

    answers.jadwal = await input({
        message: "📅 Ada meeting atau acara penting?",
    });

    answers.belum = await input({
        message: "🔁 Ada yang belum selesai dari hari ini?",
    });

    answers.goals = await input({
        message: "💪 Ada goal pribadi yang mau dicapai?",
    });

    answers.ingat = await input({
        message: "🧠 Ada yang gak boleh kamu lupain?",
    });

    return answers;
}

function buildTomorrowPrompt(answers, persona) {
    return `${persona.system}

Buat rencana terstruktur untuk besok dengan heading:
# Tomorrow Plan

## Priorities
- ...

## Schedule
09:00 - Coding
13:00 - Meeting

## Goals
- ...

## Reminders
- ...

Prioritas terbesar: ${answers.prioritas}
Meeting / acara penting: ${answers.jadwal}
Yang belum selesai: ${answers.belum}
Goal pribadi: ${answers.goals}
Jangan lupain: ${answers.ingat}

Tiap bagian langsung isinya aja, bahasa santai, bullet points.`;
}

async function aiTomorrow(options) {
    const persona = resolvePersona(options && options.persona);
    const answers = await askTomorrow();
    const prompt = buildTomorrowPrompt(answers, persona);

    try {
        const vault = getVaultPath();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const date = formatDate(tomorrow);

        const content = await generateWithSpinner(prompt);
        const filePath = path.join(vault, "Planning", "Tomorrow", `${date}.md`);
        createFile(filePath, content);
        success("Rencana besok berhasil dibuat!");
        console.log(`📁 ${c.path(filePath)}`);
    } catch (err) {
        handleAiError(err);
    }
}

async function askUpdate() {
    const answers = {};

    console.log("\n📝 Oke, kita update daily note hari ini!\n");

    answers.selesai = await input({
        message: "✅ Apa aja yang udah selesai hari ini?",
    });

    answers.kerjain = await input({
        message: "🔧 Lagi ngerjain apa sekarang?",
    });

    answers.blocker = await input({
        message: "🚧 Ada yang ngehambat?",
    });

    answers.mood = await input({
        message: "😊 Gimana mood hari ini?",
    });

    answers.syukur = await input({
        message: "🙏 Apa yang kamu syukuri hari ini?",
    });

    answers.pelajaran = await input({
        message: "📚 Ada yang kamu pelajari hari ini?",
    });

    return answers;
}

function buildUpdatePrompt(answers, tomorrowTasks = [], persona) {
    const tomorrowContext =
        Array.isArray(tomorrowTasks) && tomorrowTasks.length > 0
            ? `\nRencana dari note kemarin (bagian ## Tomorrow):\n${tomorrowTasks.join("\n")}`
            : "";

    return `${persona.system}

Update daily note hari ini. Isi 6 bagian dengan heading:
## Target Hari Ini
## Catatan
## Selesai
## Mood
## Syukur
## Refleksi

Yang udah selesai: ${answers.selesai}
Yang lagi dikerjain: ${answers.kerjain}
Hambatan: ${answers.blocker}
Mood: ${answers.mood}
Syukur: ${answers.syukur}
Pelajaran hari ini: ${answers.pelajaran}
${tomorrowContext}

Tiap bagian langsung isinya aja, bahasa santai, 2-3 kalimat.`;
}

async function aiUpdate(options) {
    const persona = resolvePersona(options && options.persona);
    const answers = await askUpdate();

    try {
        const vault = getVaultPath();
        const now = new Date();
        const date = formatDate(now);
        const filePath = path.join(vault, "Daily Notes", `${date}.md`);

        const tomorrowTasks = loadTomorrowTasks(vault, date);

        const content = await generateWithSpinner(buildUpdatePrompt(answers, tomorrowTasks, persona));
        const sections = parseSections(content);

        if (fs.existsSync(filePath)) {
            const existing = fs.readFileSync(filePath, "utf8");
            let updated = fillDailyTemplate(existing, sections);
            if (updated === existing) {
                updated = insertUnderCatatan(existing, content);
            }
            updated = importTomorrowTasks(updated, tomorrowTasks);
            fs.writeFileSync(filePath, updated);
            success("Daily note diupdate sama AI!");
        } else {
            const templatePath = path.join(
                __dirname, "..", "templates", "daily.md"
            );
            let template = `# ${date}\n\n`;
            if (fs.existsSync(templatePath)) {
                template = parseTemplate(
                    fs.readFileSync(templatePath, "utf8"),
                    getTemplateData({ title: date, folder: "Daily Notes", date })
                );
            }
            let filled = fillDailyTemplate(template, sections);
            if (filled === template) {
                filled = insertUnderCatatan(template, content);
            }
            filled = importTomorrowTasks(filled, tomorrowTasks);
            createFile(filePath, filled);
            success("Daily note baru dibuat dan diisi AI!");
        }

        if (tomorrowTasks.length > 0) {
            console.log(`📥 ${tomorrowTasks.length} task dari ## Tomorrow (note kemarin) ditambahkan ke ## Update.`);
        }

        console.log(`📁 ${c.path(filePath)}`);
    } catch (err) {
        handleAiError(err);
    }
}

async function askWeekly() {
    const answers = {};

    console.log("\n🗓️  Oke, kita rencanain seminggu ke depan!\n");

    answers.goal = await input({
        message: "🎯 Goal utama minggu ini?",
    });

    answers.prioritas = await input({
        message: "⚡ Prioritas teratas apa aja?",
    });

    answers.goals = await input({
        message: "💪 Goal pribadi?",
    });

    answers.belajar = await input({
        message: "📚 Mau belajar apa?",
    });

    answers.deadline = await input({
        message: "⏰ Ada deadline penting?",
    });

    answers.habit = await input({
        message: "🔄 Habit yang mau dijaga?",
    });

    return answers;
}

function buildWeeklyPrompt(answers, persona) {
    return `${persona.system}

Buat rencana mingguan terstruktur dengan heading:
# Weekly Plan

## Goals
- ...

## Monday
- ...

## Tuesday
- ...

## Wednesday
- ...

## Thursday
- ...

## Friday
- ...

## Saturday
- ...

## Sunday
- ...

## Notes
- ...

Goal utama: ${answers.goal}
Prioritas: ${answers.prioritas}
Goal pribadi: ${answers.goals}
Mau belajar: ${answers.belajar}
Deadline: ${answers.deadline}
Habit: ${answers.habit}

Tiap bagian langsung isinya aja, bahasa santai, bullet points.`;
}

async function aiWeekly(options) {
    const persona = resolvePersona(options && options.persona);
    const answers = await askWeekly();
    const prompt = buildWeeklyPrompt(answers, persona);

    try {
        const vault = getVaultPath();
        const now = new Date();
        const week = getISOWeek(now);

        const content = await generateWithSpinner(prompt);
        const filePath = path.join(vault, "Planning", "Weekly", `Week-${week}.md`);
        createFile(filePath, content);
        success("Rencana mingguan berhasil dibuat!");
        console.log(`📁 ${c.path(filePath)}`);
    } catch (err) {
        handleAiError(err);
    }
}

async function aiPeople(personName, options) {
    const persona = resolvePersona(options && options.persona);

    try {
        const vault = getVaultPath();

        let name = String(personName || "").trim();
        if (!name) {
            name = (await input({
                message: "👤 Nama orang? (contoh: John Doe)",
            })).trim();
            if (!name) {
                error("Nama tidak boleh kosong.");
                return;
            }
        }

        const files = scanMarkdownFiles(vault);
        const file = findPeopleNote(files, name);

        if (!file) {
            error(`People note tidak ditemukan: ${name}`);
            return;
        }

        const content = readPeopleNote(file);

        const interaction = (await input({
            message: `📝 Interaksi terakhir dengan ${name}?`,
        })).trim();

        if (!interaction) {
            error("Interaksi tidak boleh kosong.");
            return;
        }

        const prompt = buildInteractionPrompt({ name, content, interaction, persona });

        const output = await generateWithSpinner(prompt);

        const bullets = parseInteractionOutput(output);
        if (bullets.length === 0) {
            error("AI tidak menghasilkan interaksi.");
            return;
        }

        const { content: updated, changed, added, skipped } = appendInteraction(content, bullets);

        if (!changed) {
            warning("Tidak ada interaksi baru (semua duplikat).");
            return;
        }

        console.log(`\n📄 Preview perubahan untuk ${c.note(path.basename(file))}:\n`);
        console.log(`## ${INTERACTIONS_HEADING}\n`);
        added.forEach((bullet) => console.log(`+ ${bullet}`));
        if (skipped > 0) {
            console.log(`\n(${skipped} interaksi duplikat di-skip)`);
        }

        const confirmed = await confirm({
            message: "Tulis perubahan ini ke note?",
        });

        if (!confirmed) {
            console.log("Batal - tidak ada perubahan.");
            return;
        }

        updateMarkdown(file, updated);
        success("Interaksi ditambahkan ke People note!");
        console.log(`📁 ${c.path(file)}`);
    } catch (err) {
        handleAiError(err);
    }
}

module.exports = { aiWrite, aiTomorrow, aiUpdate, aiWeekly, aiPeople };