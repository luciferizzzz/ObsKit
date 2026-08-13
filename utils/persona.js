const DEFAULT_PERSONA_ID = "default";

const PERSONAS = [
    {
        id: "default",
        name: "Default",
        description:
            "Default ObsKit AI assistant: bahasa Indonesia santai, langsung ke intinya.",
        system: `Tulis catatan markdown buat Obsidian.

Aturan wajib:
- Bahasa Indonesia santai, ngobrol kayak temen
- JANGAN pakai kata "kamu", "anda", "kalian" - langsung ke intinya aja
- JANGAN pembukaan kayak "Tentu", "Oke", "Baik" - langsung mulai isinya
- Heading pakai ## dan ###
- Gunakan bullet points, bold, code blocks kalau perlu
- Jangan pakai frontmatter atau YAML
- Isinya harus bermanfaat dan jelas`,
    },
];

function normalizePersonaKey(value) {
    return String(value || "").trim().toLowerCase();
}

function findPersona(idOrName) {
    const key = normalizePersonaKey(idOrName);
    if (!key) return null;

    return (
        PERSONAS.find(
            (p) =>
                normalizePersonaKey(p.id) === key ||
                normalizePersonaKey(p.name) === key
        ) || null
    );
}

function getPersona(idOrName) {
    const persona = findPersona(idOrName);
    if (!persona) {
        throw new Error(`Unknown persona: ${idOrName}`);
    }
    return persona;
}

function resolvePersona(idOrName) {
    if (idOrName === undefined || idOrName === null || normalizePersonaKey(idOrName) === "") {
        return findPersona(DEFAULT_PERSONA_ID);
    }
    return getPersona(idOrName);
}

function getPersonas() {
    return PERSONAS.slice();
}

function validatePersona(persona) {
    return Boolean(
        persona &&
            typeof persona.id === "string" &&
            persona.id.trim() &&
            typeof persona.name === "string" &&
            persona.name.trim() &&
            typeof persona.system === "string" &&
            persona.system.trim()
    );
}

function registerPersona(persona) {
    if (!validatePersona(persona)) {
        throw new Error("Invalid persona definition: id, name, and system are required.");
    }

    const key = normalizePersonaKey(persona.id);
    const existing = PERSONAS.findIndex(
        (p) => normalizePersonaKey(p.id) === key
    );

    if (existing >= 0) {
        PERSONAS.splice(existing, 1, persona);
    } else {
        PERSONAS.push(persona);
    }

    return persona;
}

function buildPersonaPrompt(persona, prompt) {
    const system = (persona && persona.system || "").trim();
    return system ? `${system}\n\n${prompt}` : String(prompt || "");
}

module.exports = {
    DEFAULT_PERSONA_ID,
    PERSONAS,
    normalizePersonaKey,
    findPersona,
    getPersona,
    resolvePersona,
    getPersonas,
    validatePersona,
    registerPersona,
    buildPersonaPrompt,
};
