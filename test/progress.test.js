const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    BAR_WIDTH,
    INTERVAL_MS,
    DEFAULT_ENABLED,
    Progress,
    createProgress,
} = require("../utils/progress");

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

test("BAR_WIDTH: positive default width", () => {
    assert.ok(BAR_WIDTH > 0);
});

test("INTERVAL_MS: positive default interval", () => {
    assert.ok(INTERVAL_MS > 0);
});

test("DEFAULT_ENABLED: boolean flag", () => {
    assert.equal(typeof DEFAULT_ENABLED, "boolean");
});

test("Progress: constructor stores total and current", () => {
    const p = new Progress({ total: 10, stream: makeStream() });
    assert.equal(p.total, 10);
    assert.equal(p.current, 0);
});

test("Progress: percent calculation", () => {
    const p = new Progress({ total: 4, stream: makeStream() });
    p.setProgress(2);
    assert.equal(p.percent, 50);
    p.setProgress(4);
    assert.equal(p.percent, 100);
});

test("Progress: percent is 100 when total is 0", () => {
    const p = new Progress({ total: 0, stream: makeStream() });
    assert.equal(p.percent, 100);
});

test("Progress: tick increments up to the total", () => {
    const p = new Progress({ total: 3, stream: makeStream() });
    p.tick(2);
    assert.equal(p.current, 2);
    p.tick(5);
    assert.equal(p.current, 3);
});

test("Progress: setProgress clamps to valid range", () => {
    const p = new Progress({ total: 5, stream: makeStream() });
    p.setProgress(-1);
    assert.equal(p.current, 0);
    p.setProgress(99);
    assert.equal(p.current, 5);
});

test("Progress: renderBar matches width", () => {
    const p = new Progress({ total: 2, barWidth: 10, stream: makeStream() });
    p.setProgress(1);
    assert.equal(p.renderBar().length, 10);
    assert.match(p.renderBar(), /^\u2588+\u2591+$/);
});

test("Progress: disabled progress writes nothing", () => {
    const stream = makeStream();
    const p = new Progress({ total: 5, stream, enabled: false });
    p.start();
    p.tick(2);
    p.stop("done");
    assert.equal(stream.chunks.length, 0);
});

test("Progress: render writes a carriage-return bar line", () => {
    const stream = makeStream();
    const p = new Progress({ total: 2, barWidth: 4, stream, enabled: true });
    p.render();
    assert.ok(stream.chunks[0].startsWith("\r["));
    assert.ok(stream.chunks[0].includes("0%"));
});

test("Progress: stop writes a newline", () => {
    const stream = makeStream();
    const p = new Progress({ total: 2, stream, enabled: true });
    p.start();
    p.tick(2);
    p.stop();
    assert.equal(p.active, false);
    assert.equal(p.timer, null);
    assert.ok(stream.chunks.includes("\n"));
});

test("createProgress: factory returns a Progress instance", () => {
    const p = createProgress({ total: 3 });
    assert.ok(p instanceof Progress);
});
