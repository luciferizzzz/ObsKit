const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const INTERVAL_MS = 80;

const DEFAULT_ENABLED = Boolean(process.stderr.isTTY);

class Spinner {
    constructor(options = {}) {
        this.frames = options.frames || FRAMES;
        this.intervalMs = options.intervalMs || INTERVAL_MS;
        this.stream = options.stream || process.stderr;
        this.enabled = options.enabled !== undefined ? options.enabled : DEFAULT_ENABLED;
        this.text = "";
        this.timer = null;
        this.frameIndex = 0;
        this.active = false;
    }

    start(text = "") {
        this.text = text;
        if (!this.enabled) return this;
        if (this.active) return this;

        this.active = true;
        this.frameIndex = 0;
        this.render(this.frames[0]);
        this.timer = setInterval(() => {
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
            this.render(this.frames[this.frameIndex]);
        }, this.intervalMs);

        return this;
    }

    setText(text) {
        this.text = text;
        if (this.active) {
            this.render(this.frames[this.frameIndex]);
        }
        return this;
    }

    stop(finalMessage) {
        if (!this.enabled) return;
        if (!this.active) return;

        clearInterval(this.timer);
        this.timer = null;
        this.active = false;

        this.stream.write("\r\x1b[2K");
        if (finalMessage) {
            this.stream.write(`${finalMessage}\n`);
        }
    }

    render(frame) {
        this.stream.write(`\r${frame} ${this.text}\x1b[K`);
    }
}

module.exports = {
    FRAMES,
    INTERVAL_MS,
    DEFAULT_ENABLED,
    Spinner,
};
