// Prints each scene's start frame and length, for picking frames to check.
import { readFileSync } from "node:fs";
const ROOT = new URL("..", import.meta.url).pathname;
const script = JSON.parse(readFileSync(ROOT + "src/data/script.json"));
const narr = JSON.parse(readFileSync(ROOT + "src/data/narration.json"));
const [video, format] = process.argv.slice(2);
const foot = JSON.parse(readFileSync(ROOT + `src/data/footage-${format}.json`));
let cur = 0;
const T = 14,
  FPS = 30;
for (const s of script.videos[video].scenes) {
  const vf = narr[s.id] ? Math.ceil(narr[s.id].seconds * FPS) : 0;
  let f;
  if (s.type === "intro") f = Math.max(vf + 40, 120);
  else if (s.type === "chapter") f = 45;
  else if (s.type === "outro") f = Math.max(vf + 85, 180);
  else {
    const min = vf + 28,
      cf = foot[s.clip].duration * FPS,
      rate = Math.min(Math.max(cf / min, 1), 2.6);
    f = Math.max(min, Math.ceil(cf / rate), 90);
  }
  f += T;
  console.log(`${s.id.padEnd(18)} from ${String(cur).padStart(4)} len ${f}`);
  cur += f - T;
}
console.log("total", cur + T, `(${((cur + T) / FPS).toFixed(1)}s)`);
