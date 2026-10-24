/**
 * Transcribes each narration file with Whisper and compares it with the script,
 * to catch garbled or missing words without listening to every take.
 * Runs separately from narrate.mjs: the phonemizer's runtime and Whisper
 * cannot share a process.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "@huggingface/transformers";

const ROOT = new URL("..", import.meta.url).pathname;
const script = JSON.parse(readFileSync(join(ROOT, "src/data/script.json"), "utf8"));
const narration = JSON.parse(readFileSync(join(ROOT, "src/data/narration.json"), "utf8"));
const asr = await pipeline("automatic-speech-recognition", "onnx-community/whisper-small.en", {
  dtype: "fp32",
});
const words = (t) =>
  t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

let worst = 0;
for (const video of Object.values(script.videos)) {
  for (const scene of video.scenes) {
    if (!scene.voice) continue;
    const pcm = execFileSync("ffmpeg", [
      "-loglevel",
      "error",
      "-i",
      join(ROOT, "public", narration[scene.id].file),
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "f32le",
      "-",
    ]);
    const heard = (
      await asr(new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4))
    ).text.trim();
    const want = words(scene.voice);
    const got = new Set(words(heard));
    const missing = want.filter((w) => !got.has(w));
    const rate = missing.length / want.length;
    worst = Math.max(worst, rate);
    console.log(
      `${scene.id.padEnd(18)} ${(100 - rate * 100).toFixed(0).padStart(3)}% words heard${missing.length ? `  missing: ${missing.join(", ")}` : ""}\n${"".padEnd(19)}heard: ${heard}`,
    );
  }
}
console.log(`Lowest match: ${(100 - worst * 100).toFixed(0)}%`);
