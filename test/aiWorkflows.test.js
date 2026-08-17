const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    buildPromptFromAnswers,
    buildTomorrowPrompt,
    buildWeeklyPrompt,
    buildUpdatePrompt,
    parseSections,
    fillDailyTemplate,
    formatDate,
    getISOWeek,
} = require("../commands/ai");

const {
    buildInteractionPrompt,
    parseInteractionOutput,
    appendInteraction,
    INTERACTIONS_HEADING,
} = require("../utils/people");

const persona = { id: "default", name: "Default", system: "SYS" };

// --- formatDate ---

test("formatDate: returns YYYY-MM-DD", () => {
    assert.equal(formatDate(new Date(2026, 0, 5)), "2026-01-05");
    assert.equal(formatDate(new Date(2026, 11, 31)), "2026-12-31");
});

// --- getISOWeek ---

test("getISOWeek: returns a valid week number", () => {
    const week = getISOWeek(new Date(2026, 7, 15));
    assert.ok(week >= 1 && week <= 53);
});

// --- parseSections ---

test("parseSections: extracts daily sections from AI output", () => {
    const aiOutput = `## Target Hari Ini

Kerjain laporan

## Catatan

Meeting jam 10

## Selesai

Selesai laporan

## Mood

Lumayan

## Syukur

Keluarga sehat

## Refleksi

Sabar itu penting`;

    const sections = parseSections(aiOutput);
    assert.equal(sections.target, "Kerjain laporan");
    assert.equal(sections.catatan, "Meeting jam 10");
    assert.equal(sections.selesai, "Selesai laporan");
    assert.equal(sections.mood, "Lumayan");
    assert.equal(sections.syukur, "Keluarga sehat");
    assert.equal(sections.refleksi, "Sabar itu penting");
});

test("parseSections: handles missing sections gracefully", () => {
    const aiOutput = "## Target Hari Ini\n\nIsi target\n";
    const sections = parseSections(aiOutput);
    assert.equal(sections.target, "Isi target");
    assert.equal(sections.catatan, undefined);
});

// --- fillDailyTemplate ---

test("fillDailyTemplate: replaces sections in template", () => {
    const template = "# 2026-08-17\n\n## Target Hari Ini\n\n-\n\n## Catatan\n\n-\n";
    const sections = { target: "New target", catatan: "New catatan" };
    const result = fillDailyTemplate(template, sections);
    assert.ok(result.includes("New target"));
    assert.ok(result.includes("New catatan"));
    assert.ok(!result.includes("\n-\n\n## Catatan"));
});

// --- buildPromptFromAnswers (Daily) ---

test("buildPromptFromAnswers: includes all structured daily questions", () => {
    const answers = {
        aktivitasUtama: "Coding ObsKit",
        waktu: "10:00",
        baik: "Banyak yang selesai",
        kurang: "Bug di Windows",
        pelajaran: "CRLF handling",
        perbaikan: "Lebih banyak test",
        interaksi: "Tim dev",
        energi: "tinggi",
        mood: "Senang",
    };

    const prompt = buildPromptFromAnswers(answers, persona);

    assert.ok(prompt.includes("SYS"));
    assert.ok(prompt.includes("Coding ObsKit"));
    assert.ok(prompt.includes("10:00"));
    assert.ok(prompt.includes("Banyak yang selesai"));
    assert.ok(prompt.includes("Bug di Windows"));
    assert.ok(prompt.includes("CRLF handling"));
    assert.ok(prompt.includes("Lebih banyak test"));
    assert.ok(prompt.includes("Tim dev"));
    assert.ok(prompt.includes("tinggi"));
    assert.ok(prompt.includes("Senang"));
    assert.ok(prompt.includes("## Target Hari Ini"));
    assert.ok(prompt.includes("## Catatan"));
    assert.ok(prompt.includes("## Selesai"));
    assert.ok(prompt.includes("## Mood"));
    assert.ok(prompt.includes("## Syukur"));
    assert.ok(prompt.includes("## Refleksi"));
});

test("buildPromptFromAnswers: instructs AI not to use certain words", () => {
    const answers = {
        aktivitasUtama: "X",
        waktu: "X",
        baik: "X",
        kurang: "X",
        pelajaran: "X",
        perbaikan: "X",
        interaksi: "X",
        energi: "X",
        mood: "X",
    };

    const prompt = buildPromptFromAnswers(answers, persona);
    assert.ok(prompt.includes('JANGAN pakai kata "kamu", "anda", "kalian"'));
    assert.ok(prompt.includes('JANGAN pembukaan kayak "Tentu", "Oke", "Baik"'));
});

// --- buildTomorrowPrompt ---

test("buildTomorrowPrompt: generates checklist format for single activity", () => {
    const answers = {
        activities: [
            {
                name: "Learn JavaScript",
                startTime: "08:00",
                endTime: "09:00",
                priority: "High",
                goal: "Finish Array section",
                notes: "",
            },
        ],
    };

    const prompt = buildTomorrowPrompt(answers, persona);

    assert.ok(prompt.includes("SYS"));
    assert.ok(prompt.includes("# Tomorrow"));
    assert.ok(prompt.includes("- [ ] 08:00-09:00 Learn JavaScript"));
    assert.ok(prompt.includes("Priority: High"));
    assert.ok(prompt.includes("Goal: Finish Array section"));
    assert.ok(!prompt.includes("## Priorities"));
    assert.ok(!prompt.includes("## Schedule"));
    assert.ok(!prompt.includes("## Goals"));
    assert.ok(!prompt.includes("## Reminders"));
});

test("buildTomorrowPrompt: generates checklist for multiple activities", () => {
    const answers = {
        activities: [
            {
                name: "Learn JavaScript",
                startTime: "08:00",
                endTime: "09:00",
                priority: "High",
                goal: "Finish Array section",
                notes: "",
            },
            {
                name: "Develop ObsKit",
                startTime: "10:00",
                endTime: "12:00",
                priority: "High",
                goal: "Complete People Management",
                notes: "Focus on tests",
            },
        ],
    };

    const prompt = buildTomorrowPrompt(answers, persona);

    assert.ok(prompt.includes("- [ ] 08:00-09:00 Learn JavaScript"));
    assert.ok(prompt.includes("- [ ] 10:00-12:00 Develop ObsKit"));
    assert.ok(prompt.includes("Goal: Finish Array section"));
    assert.ok(prompt.includes("Goal: Complete People Management"));
    assert.ok(prompt.includes("Catatan: Focus on tests"));
});

test("buildTomorrowPrompt: handles missing time gracefully", () => {
    const answers = {
        activities: [
            {
                name: "Read book",
                startTime: "",
                endTime: "",
                priority: "Medium",
                goal: "Read 50 pages",
                notes: "",
            },
        ],
    };

    const prompt = buildTomorrowPrompt(answers, persona);
    assert.ok(prompt.includes("Belum ditentukan"));
    assert.ok(prompt.includes("Read book"));
});

test("buildTomorrowPrompt: handles missing priority defaults to Medium", () => {
    const answers = {
        activities: [
            {
                name: "Exercise",
                startTime: "07:00",
                endTime: "08:00",
                priority: "",
                goal: "Run 5km",
                notes: "",
            },
        ],
    };

    const prompt = buildTomorrowPrompt(answers, persona);
    assert.ok(prompt.includes("Priority: Medium"));
});

test("buildTomorrowPrompt: handles empty activities list", () => {
    const answers = { activities: [] };
    const prompt = buildTomorrowPrompt(answers, persona);
    assert.ok(prompt.includes("# Tomorrow"));
    assert.ok(prompt.includes("SYS"));
});

// --- buildWeeklyPrompt ---

test("buildWeeklyPrompt: includes review categories and weekly plan", () => {
    const answers = {
        pencapaian: "Completed People Management",
        produktivitas: "Meetings",
        belajar: "CRLF handling",
        relation: "Tim dev",
        tidur: "Cukup",
        energi: "Tinggi",
        obsKitDone: "People list, recent, stats",
        obsKitIssues: "None",
        goal: "Finish AI workflows",
        prioritas: "Tests",
        personalGoals: "Exercise",
        belajarNext: "TypeScript",
        deadline: "Friday",
        habit: "Morning run",
    };

    const prompt = buildWeeklyPrompt(answers, persona);

    assert.ok(prompt.includes("SYS"));
    assert.ok(prompt.includes("# Weekly Review & Plan"));
    assert.ok(prompt.includes("## Achievements"));
    assert.ok(prompt.includes("## Productivity"));
    assert.ok(prompt.includes("## Learning"));
    assert.ok(prompt.includes("## Relationships"));
    assert.ok(prompt.includes("## Health"));
    assert.ok(prompt.includes("## ObsKit Development"));
    assert.ok(prompt.includes("## Goals for Next Week"));
    assert.ok(prompt.includes("## Monday"));
    assert.ok(prompt.includes("## Tuesday"));
    assert.ok(prompt.includes("## Wednesday"));
    assert.ok(prompt.includes("## Thursday"));
    assert.ok(prompt.includes("## Friday"));
    assert.ok(prompt.includes("## Saturday"));
    assert.ok(prompt.includes("## Sunday"));
    assert.ok(prompt.includes("## Notes"));
    assert.ok(prompt.includes("Completed People Management"));
    assert.ok(prompt.includes("Meetings"));
    assert.ok(prompt.includes("CRLF handling"));
    assert.ok(prompt.includes("Tim dev"));
    assert.ok(prompt.includes("Cukup"));
    assert.ok(prompt.includes("Tinggi"));
    assert.ok(prompt.includes("People list, recent, stats"));
    assert.ok(prompt.includes("Finish AI workflows"));
    assert.ok(prompt.includes("Tests"));
    assert.ok(prompt.includes("Exercise"));
    assert.ok(prompt.includes("TypeScript"));
    assert.ok(prompt.includes("Friday"));
    assert.ok(prompt.includes("Morning run"));
});

// --- buildUpdatePrompt ---

test("buildUpdatePrompt: includes all daily update fields", () => {
    const answers = {
        selesai: "Tests done",
        kerjain: "Documentation",
        blocker: "None",
        mood: "Good",
        syukur: "Health",
        pelajaran: "TDD",
    };

    const prompt = buildUpdatePrompt(answers, [], persona);
    assert.ok(prompt.includes("SYS"));
    assert.ok(prompt.includes("Tests done"));
    assert.ok(prompt.includes("Documentation"));
    assert.ok(prompt.includes("None"));
    assert.ok(prompt.includes("Good"));
    assert.ok(prompt.includes("Health"));
    assert.ok(prompt.includes("TDD"));
    assert.ok(prompt.includes("## Target Hari Ini"));
    assert.ok(prompt.includes("## Catatan"));
    assert.ok(prompt.includes("## Selesai"));
    assert.ok(prompt.includes("## Mood"));
    assert.ok(prompt.includes("## Syukur"));
    assert.ok(prompt.includes("## Refleksi"));
});

test("buildUpdatePrompt: includes tomorrow tasks as context when provided", () => {
    const answers = {
        selesai: "Done",
        kerjain: "WIP",
        blocker: "No",
        mood: "Ok",
        syukur: "Yes",
        pelajaran: "Stuff",
    };

    const tasks = ["- [ ] Finish tests", "- [ ] Update docs"];
    const prompt = buildUpdatePrompt(answers, tasks, persona);
    assert.ok(prompt.includes("Rencana dari note kemarin"));
    assert.ok(prompt.includes("- [ ] Finish tests"));
    assert.ok(prompt.includes("- [ ] Update docs"));
});

// --- buildInteractionPrompt (People) ---

test("buildInteractionPrompt: includes structured interaction details", () => {
    const interaction = "2026-08-15. Discussed frontend project. John will help next week. Follow-up: send design. Hubungan ini perlu perhatian lebih.";

    const prompt = buildInteractionPrompt({
        name: "John Doe",
        content: "# John Doe\n\n## Catatan Interaksi\n\n- old\n",
        interaction,
        persona,
    });

    assert.ok(prompt.includes("SYS"));
    assert.ok(prompt.includes("John Doe"));
    assert.ok(prompt.includes("2026-08-15"));
    assert.ok(prompt.includes("Discussed frontend project"));
    assert.ok(prompt.includes("John will help next week"));
    assert.ok(prompt.includes("Follow-up: send design"));
    assert.ok(prompt.includes("Catatan Interaksi"));
});

test("buildInteractionPrompt: works with minimal interaction info", () => {
    const prompt = buildInteractionPrompt({
        name: "Alice",
        content: "# Alice\n",
        interaction: "Met for coffee",
        persona,
    });

    assert.ok(prompt.includes("SYS"));
    assert.ok(prompt.includes("Alice"));
    assert.ok(prompt.includes("Met for coffee"));
});

// --- People workflow: parse and append ---

test("people workflow: parseInteractionOutput handles structured bullets", () => {
    const output = `- Met on 2026-08-15
- Discussed frontend architecture
- Follow-up: review PR next week
- Hubungan perlu perhatian lebih`;

    const bullets = parseInteractionOutput(output);
    assert.equal(bullets.length, 4);
    assert.ok(bullets[0].includes("Met on 2026-08-15"));
    assert.ok(bullets[1].includes("Discussed frontend architecture"));
    assert.ok(bullets[2].includes("Follow-up: review PR next week"));
    assert.ok(bullets[3].includes("Hubungan perlu perhatian lebih"));
});

test("people workflow: appendInteraction adds new bullets to existing section", () => {
    const content = `# John Doe

## Catatan Interaksi

- Old interaction.
`;

    const { content: updated, changed, added } = appendInteraction(content, [
        "- New interaction about frontend.",
    ]);

    assert.equal(changed, true);
    assert.deepEqual(added, ["- New interaction about frontend."]);
    assert.ok(updated.includes("- Old interaction."));
    assert.ok(updated.includes("- New interaction about frontend."));
    assert.ok(
        updated.indexOf("- New interaction about frontend.") >
        updated.indexOf("- Old interaction.")
    );
});

test("people workflow: appendInteraction preserves all existing sections", () => {
    const content = `# John Doe

## Profil

Developer

## Kontak

- Email: john@test.com

## Catatan Interaksi

- Old one.

## Related

- [[Other Note]]
`;

    const { content: updated } = appendInteraction(content, ["- Added item."]);
    assert.ok(updated.includes("## Profil"));
    assert.ok(updated.includes("## Kontak"));
    assert.ok(updated.includes("## Catatan Interaksi"));
    assert.ok(updated.includes("## Related"));
    assert.ok(updated.includes("- Old one."));
    assert.ok(updated.includes("- Added item."));
});

test("people workflow: appendInteraction deduplicates case-insensitively", () => {
    const content = `# Test

## Catatan Interaksi

- Discussed the website.
`;

    const { changed } = appendInteraction(content, [
        "- DISCUSSED THE WEBSITE.",
    ]);
    assert.equal(changed, false);
});

test("people workflow: appendInteraction preserves CRLF line endings", () => {
    const crlf = "# Test\r\n\r\n## Catatan Interaksi\r\n\r\n- Old.\r\n";
    const { content } = appendInteraction(crlf, ["- New item."]);
    assert.ok(content.includes("\r\n"));
    assert.ok(!content.replace(/\r\n/g, "").includes("\r"));
    assert.ok(content.includes("- New item."));
});

// --- Backward compatibility ---

test("backward compatibility: daily sections are unchanged", () => {
    const answers = {
        aktivitasUtama: "X",
        waktu: "X",
        baik: "X",
        kurang: "X",
        pelajaran: "X",
        perbaikan: "X",
        interaksi: "X",
        energi: "X",
        mood: "X",
    };

    const prompt = buildPromptFromAnswers(answers, persona);
    assert.ok(prompt.includes("## Target Hari Ini"));
    assert.ok(prompt.includes("## Catatan"));
    assert.ok(prompt.includes("## Selesai"));
    assert.ok(prompt.includes("## Mood"));
    assert.ok(prompt.includes("## Syukur"));
    assert.ok(prompt.includes("## Refleksi"));
});

test("backward compatibility: tomorrow heading is # Tomorrow", () => {
    const answers = { activities: [] };
    const prompt = buildTomorrowPrompt(answers, persona);
    assert.ok(prompt.includes("# Tomorrow"));
});

test("backward compatibility: weekly has Monday-Sunday sections", () => {
    const answers = {
        pencapaian: "", produktivitas: "", belajar: "", relation: "",
        tidur: "", energi: "", obsKitDone: "", obsKitIssues: "",
        goal: "", prioritas: "", personalGoals: "", belajarNext: "",
        deadline: "", habit: "",
    };
    const prompt = buildWeeklyPrompt(answers, persona);
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
        assert.ok(prompt.includes(`## ${day}`));
    }
});

test("backward compatibility: update prompt preserves daily sections", () => {
    const answers = {
        selesai: "X", kerjain: "X", blocker: "X",
        mood: "X", syukur: "X", pelajaran: "X",
    };
    const prompt = buildUpdatePrompt(answers, [], persona);
    assert.ok(prompt.includes("## Target Hari Ini"));
    assert.ok(prompt.includes("## Catatan"));
    assert.ok(prompt.includes("## Selesai"));
    assert.ok(prompt.includes("## Mood"));
    assert.ok(prompt.includes("## Syukur"));
    assert.ok(prompt.includes("## Refleksi"));
});

test("backward compatibility: people note sections are preserved", () => {
    const content = `# John Doe

## Profil

Dev

## Kontak

- Email: test@test.com

## Pertemuan

-

## Catatan Interaksi

- Old.
`;
    const { content: updated } = appendInteraction(content, ["- New."]);
    assert.ok(updated.includes("## Profil"));
    assert.ok(updated.includes("## Kontak"));
    assert.ok(updated.includes("## Pertemuan"));
    assert.ok(updated.includes("## Catatan Interaksi"));
    assert.ok(updated.includes("## Related") === false);
});
