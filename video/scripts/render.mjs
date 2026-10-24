/**
 * Renders the demo videos to out/.
 *   node scripts/render.mjs [composition-id ...]   (default: all four)
 *   node scripts/render.mjs --still jobseeker-desktop 120   (one frame, for checking)
 */
import { execFileSync, spawnSync } from "node:child_process";
import { renameSync } from "node:fs";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: join(ROOT, "src/index.ts") });

if (args[0] === "--still") {
  const [, id, ...frames] = args;
  const composition = await selectComposition({ serveUrl, id });
  for (const f of frames) {
    const output = join(ROOT, "out", "stills", `${id}-${f}.png`);
    await renderStill({ composition, serveUrl, output, frame: Number(f) });
    console.log(output);
  }
} else {
  const ids = args.length
    ? args
    : ["jobseeker-desktop", "jobseeker-mobile", "backoffice-desktop", "backoffice-mobile"];
  for (const id of ids) {
    const composition = await selectComposition({ serveUrl, id });
    const outputLocation = join(ROOT, "out", `trabaho-binan-${id}.mp4`);
    const t0 = Date.now();
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      crf: 18,
      audioBitrate: "192k",
      outputLocation,
      concurrency: 6,
      onProgress: ({ progress }) => {
        if (Math.round(progress * 100) % 20 === 0)
          process.stdout.write(`\r${id} ${Math.round(progress * 100)}%`);
      },
    });
    loudnorm(outputLocation);
    console.log(
      `\n${outputLocation} (${(composition.durationInFrames / composition.fps).toFixed(1)}s, rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s)`,
    );
  }
}

/** Two-pass loudness normalisation to -16 LUFS (web/social); the video stream is copied. */
function loudnorm(file) {
  const target = "I=-16:TP=-1.5:LRA=11";
  // ffmpeg prints the loudnorm measurement on stderr.
  const measure = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      file,
      "-af",
      `loudnorm=${target}:print_format=json`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  ).stderr;
  const start = measure.lastIndexOf("{");
  const m = JSON.parse(measure.slice(start, measure.indexOf("}", start) + 1));
  const tmp = file.replace(/\.mp4$/, ".tmp.mp4");
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    file,
    "-c:v",
    "copy",
    "-af",
    `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    tmp,
  ]);
  renameSync(tmp, file);
}
