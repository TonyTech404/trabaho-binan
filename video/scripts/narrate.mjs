/**
 * Generates the narration with Kokoro (Apache-2.0). Check it afterwards with
 * check-narration.mjs, which transcribes every line back with Whisper.
 *
 *   node scripts/narrate.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KokoroTTS } from "kokoro-js";

const ROOT = new URL("..", import.meta.url).pathname;
const script = JSON.parse(readFileSync(join(ROOT, "src/data/script.json"), "utf8"));
const outDir = join(ROOT, "public/narration");
mkdirSync(outDir, { recursive: true });

// Plain-English respellings (kokoro-js reads phoneme markup aloud, so it cannot be used).
const spoken = (text) =>
  Object.entries(script.pronounce).reduce((t, [word, say]) => t.replaceAll(word, say), text);

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: "fp32",
  device: "cpu",
});

const result = {};
for (const [videoId, video] of Object.entries(script.videos)) {
  for (const scene of video.scenes) {
    if (!scene.voice) continue;
    const audio = await tts.generate(spoken(scene.voice), { voice: script.voice, speed: 1.0 });
    const file = join(outDir, `${scene.id}.wav`);
    await audio.save(file);
    const seconds = audio.audio.length / audio.sampling_rate;
    const entry = { file: `narration/${scene.id}.wav`, seconds: Number(seconds.toFixed(3)) };
    result[scene.id] = entry;
    console.log(`${videoId}/${scene.id} ${seconds.toFixed(1)}s`);
  }
}
writeFileSync(join(ROOT, "src/data/narration.json"), JSON.stringify(result, null, 2));
