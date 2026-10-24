/** Copies captured clips into public/ and writes their metadata for the compositions. */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
for (const format of ["desktop", "mobile"]) {
  const src = join(ROOT, "footage", format);
  if (!existsSync(src)) continue;
  const dst = join(ROOT, "public", "footage", format);
  mkdirSync(dst, { recursive: true });
  const meta = {};
  for (const f of readdirSync(src).filter((f) => f.endsWith(".json"))) {
    const m = JSON.parse(readFileSync(join(src, f), "utf8"));
    cpSync(join(src, `${m.name}.mp4`), join(dst, `${m.name}.mp4`));
    meta[m.name] = {
      file: `footage/${format}/${m.name}.mp4`,
      duration: m.duration,
      marks: m.marks,
    };
  }
  writeFileSync(join(ROOT, "src", "data", `footage-${format}.json`), JSON.stringify(meta, null, 2));
  console.log(format, Object.keys(meta).length, "clips");
}
