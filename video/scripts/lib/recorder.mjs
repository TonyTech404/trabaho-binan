/**
 * Records a Playwright page with the Chrome DevTools screencast (sharp frames
 * at the device pixel ratio) and turns each scene into a constant-frame-rate
 * MP4. Also injects a visible cursor (desktop) or tap ripples (mobile), since
 * headless browsers draw neither.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs in every page: draws the cursor/taps and offers smooth scrolling. */
export const OVERLAY_SCRIPT = `(() => {
  if (window.__demo) return;
  const touch = matchMedia("(pointer: coarse)").matches;
  const saved = JSON.parse(sessionStorage.getItem("__demoCursor") || '{"x":-60,"y":-60}');
  let x = saved.x, y = saved.y, cursor, layer;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function ensure() {
    if (layer || !document.body) return;
    layer = document.createElement("div");
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    if (!touch) {
      cursor = document.createElement("div");
      cursor.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2.5 19 12.6l-6.8 1.2 4.1 7.2-2.6 1.5-4.1-7.2L5 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      cursor.style.cssText = "position:absolute;left:0;top:0;width:30px;height:30px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));transform-origin:4px 3px;will-change:transform";
      layer.appendChild(cursor);
    }
    document.documentElement.appendChild(layer);
    place();
  }
  function place() {
    if (cursor) cursor.style.transform = "translate(" + (x - 4) + "px," + (y - 3) + "px)";
    sessionStorage.setItem("__demoCursor", JSON.stringify({ x, y }));
  }
  function ripple(px, py, size, color) {
    ensure();
    const r = document.createElement("div");
    r.style.cssText = "position:absolute;left:" + (px - size / 2) + "px;top:" + (py - size / 2) + "px;width:" + size + "px;height:" + size + "px;border-radius:50%;background:" + color + ";transform:scale(.2);opacity:.9;transition:transform 450ms cubic-bezier(.2,.8,.2,1),opacity 450ms ease-out";
    layer.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = "scale(1)"; r.style.opacity = "0"; });
    setTimeout(() => r.remove(), 600);
  }
  window.__demo = {
    moveTo(tx, ty, ms) {
      ensure();
      const fx = x, fy = y, start = performance.now();
      return new Promise((done) => {
        const step = (now) => {
          const t = Math.min(1, (now - start) / ms), e = ease(t);
          x = fx + (tx - fx) * e; y = fy + (ty - fy) * e; place();
          t < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      });
    },
    click() {
      ensure();
      ripple(x, y, 46, "rgba(30,95,36,.45)");
      if (cursor) {
        cursor.animate([{ scale: 1 }, { scale: 0.82 }, { scale: 1 }], { duration: 220 });
      }
    },
    tap(px, py) { ripple(px, py, 64, "rgba(30,95,36,.4)"); },
    scrollTo(ty, ms) {
      const fy = window.scrollY, start = performance.now();
      const max = document.documentElement.scrollHeight - innerHeight;
      ty = Math.max(0, Math.min(max, ty));
      return new Promise((done) => {
        const step = (now) => {
          const t = Math.min(1, (now - start) / ms);
          window.scrollTo(0, fy + (ty - fy) * ease(t));
          t < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      });
    },
  };
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", ensure) : ensure();
})();`;

export class Recorder {
  /** @param {import('playwright').Page} page */
  constructor(page, outDir, { touch, size }) {
    this.page = page;
    this.outDir = outDir;
    this.touch = touch;
    this.size = size; // output video size, e.g. "2560:1440"
    mkdirSync(outDir, { recursive: true });
  }

  async attach() {
    if (this.cdp) return;
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
      if (this.frames) this.frames.push({ ts: metadata.timestamp, data });
      await this.cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
  }

  async start(name) {
    await this.attach();
    this.name = name;
    this.frames = [];
    this.marks = [];
    this.wallStart = Date.now() / 1000;
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
    await sleep(250);
  }

  /** Remember where an element is (viewport CSS px) at this moment, for zooms. */
  async mark(label, locator) {
    const box = locator ? await locator.boundingBox() : null;
    const vp = this.page.viewportSize();
    this.marks.push({ label, t: Date.now() / 1000 - this.wallStart, box, viewport: vp });
  }

  async stop() {
    await sleep(400);
    await this.cdp.send("Page.stopScreencast");
    const end = Date.now() / 1000;
    const frames = this.frames;
    this.frames = null;
    const dir = join(this.outDir, `.frames-${this.name}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const lines = [];
    frames.forEach((f, i) => {
      const file = `f${String(i).padStart(5, "0")}.jpg`;
      writeFileSync(join(dir, file), Buffer.from(f.data, "base64"));
      const from = i === 0 ? this.wallStart : f.ts;
      const next = i + 1 < frames.length ? frames[i + 1].ts : end;
      lines.push(`file '${file}'`, `duration ${Math.max(0.001, next - from).toFixed(4)}`);
    });
    lines.push(`file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'`);
    writeFileSync(join(dir, "list.txt"), lines.join("\n"));
    const out = join(this.outDir, `${this.name}.mp4`);
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      join(dir, "list.txt"),
      "-vf",
      `fps=30,scale=${this.size}:flags=lanczos,format=yuv420p`,
      "-c:v",
      "libx264",
      "-crf",
      "15",
      "-preset",
      "medium",
      "-movflags",
      "+faststart",
      out,
    ]);
    rmSync(dir, { recursive: true, force: true });
    const duration = end - this.wallStart;
    writeFileSync(
      join(this.outDir, `${this.name}.json`),
      JSON.stringify(
        { name: this.name, duration, frames: frames.length, marks: this.marks },
        null,
        2,
      ),
    );
    console.log(`  ✓ ${this.name}: ${duration.toFixed(1)}s, ${frames.length} frames`);
    return { duration };
  }
}

/** Interaction helpers that show what is happening on screen. */
export function actions(page, touch) {
  const centre = async (locator) => {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 24) };
  };
  const api = {
    async reveal(locator, { at = 0.35, ms = 900 } = {}) {
      const top = await locator.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      const vh = page.viewportSize().height;
      await page.evaluate(([y, ms]) => window.__demo.scrollTo(y, ms), [top - vh * at, ms]);
      await sleep(120);
    },
    async scrollBy(dy, ms = 1000) {
      await page.evaluate(([dy, ms]) => window.__demo.scrollTo(window.scrollY + dy, ms), [dy, ms]);
    },
    async point(locator, ms = 650) {
      if (touch) return;
      const { x, y } = await centre(locator);
      await page.evaluate(([x, y, ms]) => window.__demo.moveTo(x, y, ms), [x, y, ms]);
    },
    async click(locator, { reveal = true, ms } = {}) {
      if (reveal) await api.reveal(locator, { ms: 700 });
      if (touch) {
        const { x, y } = await centre(locator);
        await page.evaluate(([x, y]) => window.__demo.tap(x, y), [x, y]);
        await sleep(180);
      } else {
        await api.point(locator, ms);
        await page.evaluate(() => window.__demo.click());
        await sleep(160);
      }
      await locator.click();
    },
    async type(locator, text, delay = 45) {
      await api.click(locator);
      await locator.pressSequentially(text, { delay });
    },
    async select(locator, value) {
      await api.click(locator, { reveal: true }).catch(() => {});
      await locator.selectOption(value);
      await sleep(250);
    },
  };
  return api;
}
