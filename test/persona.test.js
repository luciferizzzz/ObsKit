const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    DEFAULT_PERSONA_ID,
    findPersona,
    getPersona,
    resolvePersona,
    getPersonas,
    validatePersona,
    registerPersona,
    buildPersonaPrompt,
} = require("../utils/persona");

test("DEFAULT_PERSONA_ID is 'default'", () => {
    assert.equal(DEFAULT_PERSONA_ID, "default");
});

test("findPersona: finds default by id", () => {
    assert.equal(findPersona("default").id, "default");
});

test("findPersona: finds by name case-insensitively", () => {
    assert.equal(findPersona("DEFAULT").id, "default");
    assert.equal(findPersona("default").name, "Default");
});

test("findPersona: returns null for unknown persona", () => {
    assert.equal(findPersona("nope"), null);
    assert.equal(findPersona(""), null);
    assert.equal(findPersona(null), null);
});

test("getPersona: throws for unknown persona", () => {
    assert.throws(() => getPersona("nope"), /Unknown persona/);
});

test("getPersona: returns persona for known id", () => {
    assert.equal(getPersona("default").id, "default");
});

test("resolvePersona: defaults when no persona selected", () => {
    assert.equal(resolvePersona().id, "default");
    assert.equal(resolvePersona("").id, "default");
    assert.equal(resolvePersona(null).id, "default");
    assert.equal(resolvePersona(undefined).id, "default");
});

test("resolvePersona: selects persona by name", () => {
    assert.equal(resolvePersona("Default").id, "default");
});

test("resolvePersona: throws for invalid persona", () => {
    assert.throws(() => resolvePersona("missing"), /Unknown persona/);
});

test("getPersonas: returns a copy of the registry", () => {
    const personas = getPersonas();
    assert.ok(Array.isArray(personas));
    assert.ok(personas.length >= 1);

    personas.push({ id: "x" });
    assert.equal(getPersonas().length, personas.length - 1);
});

test("validatePersona: requires id, name, and system", () => {
    assert.equal(validatePersona({ id: "a", name: "A", system: "sys" }), true);
    assert.equal(validatePersona({ id: "a", name: "A", system: " " }), false);
    assert.equal(validatePersona({ id: "", name: "A", system: "sys" }), false);
    assert.equal(validatePersona({ id: "a", name: "A" }), false);
    assert.equal(validatePersona({ id: "a" }), false);
    assert.equal(validatePersona(null), false);
});

test("registerPersona: adds a persona to the registry", () => {
    registerPersona({
        id: "test-persona",
        name: "Test Persona",
        description: "Test only",
        system: "Be helpful and concise.",
    });

    const persona = findPersona("Test Persona");
    assert.ok(persona);
    assert.equal(persona.id, "test-persona");
    assert.equal(persona.system, "Be helpful and concise.");
});

test("registerPersona: replaces existing persona with same id", () => {
    registerPersona({ id: "test-persona", name: "Test Persona", system: "Updated." });
    assert.equal(findPersona("test-persona").system, "Updated.");
});

test("registerPersona: throws for invalid persona", () => {
    assert.throws(() => registerPersona({ id: "bad" }), /Invalid persona/);
});

test("buildPersonaPrompt: prefixes the system prompt", () => {
    const persona = { id: "p", name: "P", system: "Be terse." };
    assert.equal(buildPersonaPrompt(persona, "hello"), "Be terse.\n\nhello");
});

test("buildPersonaPrompt: returns prompt when system is missing", () => {
    assert.equal(buildPersonaPrompt({ system: "" }, "hi"), "hi");
    assert.equal(buildPersonaPrompt({}, "hi"), "hi");
});

test("default behavior preserved: default persona keeps the original system prompt", () => {
    const persona = resolvePersona();
    assert.ok(persona.system.includes("Tulis catatan markdown buat Obsidian"));
    assert.ok(persona.system.includes("JANGAN pakai kata"));
    assert.ok(persona.system.includes("Jangan pakai frontmatter atau YAML"));
});
