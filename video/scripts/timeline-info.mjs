// Prints each scene's start frame and length, for picking frames to check.
// Mirrors src/timeline.ts (TRANSITION, VOICE_DELAY and scene lengths); keep them in step.
import { readFileSync } from "node:fs";
const ROOT = new URL("..", import.meta.url).pathname;
const script = JSON.parse(readFileSync(ROOT + "src/data/script.json"));
const narr = JSON.parse(readFileSync(ROOT + "src/data/narration.json"));
const [video, format] = process.argv.slice(2);
const foot = JSON.parse(readFileSync(ROOT + `src/data/footage-${format}.json`));
let cur = 0;
const T = 20,
  FPS = 30;
for (const s of script.videos[video].scenes) {
  const vf = narr[s.id] ? Math.ceil(narr[s.id].seconds * FPS) : 0;
  let f;
  if (s.type === "intro") f = Math.max(vf + 42, 120);
  else if (s.type === "chapter") f = 51;
  else if (s.type === "outro") f = Math.max(vf + 87, 180);
  else {
    const min = vf + 30,
      cf = foot[s.clip].duration * FPS,
      rate = Math.min(Math.max(cf / min, 1), 2.6);
    f = Math.max(min, Math.ceil(cf / rate), 90);
  }
  f += T;
  console.log(`${s.id.padEnd(18)} from ${String(cur).padStart(4)} len ${f}`);
  cur += f - T;
}
console.log("total", cur + T, `(${((cur + T) / FPS).toFixed(1)}s)`);
