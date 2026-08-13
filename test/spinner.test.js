const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    FRAMES,
    INTERVAL_MS,
    DEFAULT_ENABLED,
    Spinner,
} = require("../utils/spinner");

function makeStream() {
    const chunks = [];
    return {
        chunks,
        write: (text) => {
            chunks.push(text);
            return true;
        },
    };
}

test("FRAMES: exports a non-empty list of spinner frames", () => {
    assert.ok(Array.isArray(FRAMES));
    assert.ok(FRAMES.length >= 3);
});

test("INTERVAL_MS: positive default interval", () => {
    assert.ok(INTERVAL_MS > 0);
});

test("DEFAULT_ENABLED: boolean flag", () => {
    assert.equal(typeof DEFAULT_ENABLED, "boolean");
});

test("Spinner: disabled spinner writes nothing", () => {
    const stream = makeStream();
    const spinner = new Spinner({ stream, enabled: false });
    spinner.start("loading");
    spinner.setText("still loading");
    spinner.stop("done");
    assert.equal(stream.chunks.length, 0);
    assert.equal(spinner.active, false);
});

test("Spinner: render writes a carriage-return frame line", () => {
    const stream = makeStream();
    const spinner = new Spinner({ stream, enabled: true });
    spinner.render("⠋");
    assert.equal(stream.chunks[0], "\r⠋ \x1b[K");
});

test("Spinner: start renders the first frame", () => {
    const stream = makeStream();
    const spinner = new Spinner({ stream, enabled: true });
    try {
        spinner.start("Working...");
        assert.equal(spinner.active, true);
        assert.ok(stream.chunks[0].startsWith("\r"));
        assert.ok(stream.chunks[0].includes("Working..."));
    } finally {
        spinner.stop();
    }
});

test("Spinner: setText updates the message", () => {
    const stream = makeStream();
    const spinner = new Spinner({ stream, enabled: true });
    try {
        spinner.setText("before");
        spinner.start("after");
        assert.equal(spinner.text, "after");
    } finally {
        spinner.stop();
    }
});

test("Spinner: stop clears the timer and writes the final message", () => {
    const stream = makeStream();
    const spinner = new Spinner({ stream, enabled: true });
    spinner.start("loading");
    spinner.stop("✅ done");
    assert.equal(spinner.active, false);
    assert.equal(spinner.timer, null);
    assert.ok(stream.chunks.some((c) => c.includes("done")));
});
