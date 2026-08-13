const BAR_WIDTH = 20;
const FULL = "█";
const EMPTY = "░";
const INTERVAL_MS = 100;

const DEFAULT_ENABLED = Boolean(process.stderr.isTTY);

class Progress {
    constructor(options = {}) {
        this.total = Math.max(0, Number(options.total) || 0);
        this.current = 0;
        this.text = options.text || "";
        this.stream = options.stream || process.stderr;
        this.barWidth = options.barWidth || BAR_WIDTH;
        this.enabled = options.enabled !== undefined ? options.enabled : DEFAULT_ENABLED;
        this.timer = null;
        this.active = false;
    }

    start() {
        if (!this.enabled || this.active) return this;
        this.active = true;
        this.render();
        this.timer = setInterval(() => this.render(), INTERVAL_MS);
        return this;
    }

    tick(n = 1) {
        this.current = Math.min(this.total, this.current + Math.max(0, Number(n) || 0));
        this.render();
        return this;
    }

    setProgress(n) {
        this.current = Math.min(this.total, Math.max(0, Number(n) || 0));
        this.render();
        return this;
    }

    setText(text) {
        this.text = text;
        this.render();
        return this;
    }

    get percent() {
        if (this.total === 0) return 100;
        return Math.round((this.current / this.total) * 100);
    }

    renderBar() {
        const filled = Math.round((this.current / this.total) * this.barWidth);
        return FULL.repeat(filled) + EMPTY.repeat(this.barWidth - filled);
    }

    render() {
        if (!this.enabled) return;
        const pct = String(this.percent).padStart(3);
        const bar = this.renderBar();
        const text = this.text ? ` ${this.text}` : "";
        this.stream.write(`\r[${bar}] ${pct}%${text}\x1b[K`);
    }

    stop(finalMessage) {
        if (!this.enabled) return;
        if (!this.active) return;

        clearInterval(this.timer);
        this.timer = null;
        this.active = false;

        if (this.total > 0 && this.current >= this.total) {
            this.render();
        }

        this.stream.write("\n");
        if (finalMessage) {
            this.stream.write(`${finalMessage}\n`);
        }
    }
}

function createProgress(options) {
    return new Progress(options);
}

module.exports = {
    BAR_WIDTH,
    INTERVAL_MS,
    DEFAULT_ENABLED,
    Progress,
    createProgress,
};
