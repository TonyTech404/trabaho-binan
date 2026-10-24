import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { Fragment } from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from "remotion";
import {
  Backdrop,
  BrowserFrame,
  Chapter,
  Headline,
  Intro,
  Outro,
  PhoneFrame,
  ProgressBar,
  Subtitle,
} from "./components/Parts";
import { TRANSITION, type Format } from "./theme";
import script from "./data/script.json";
import { buildTimeline, type TimedScene, type VideoId } from "./timeline";

export type DemoProps = {
  video: VideoId;
  format: Format;
};

function SceneView({
  scene,
  format,
  title,
  tagline,
  credit,
}: {
  scene: TimedScene;
  format: Format;
  title: string;
  tagline: string;
  credit: string;
}) {
  const subtitle = scene.subtitle ?? scene.voice;
  return (
    <AbsoluteFill>
      {scene.type === "intro" ? <Intro title={title} tagline={tagline} format={format} /> : null}
      {scene.type === "chapter" ? (
        <Chapter label={scene.label!} icon={scene.icon!} format={format} />
      ) : null}
      {scene.type === "outro" ? (
        <Outro format={format} credit={credit} closing="Free to use. Never pay to apply." />
      ) : null}
      {scene.type === "clip" ? (
        <>
          {format === "desktop" ? <BrowserFrame scene={scene} /> : <PhoneFrame scene={scene} />}
          <Headline text={scene.headline ?? ""} format={format} />
        </>
      ) : null}
      {subtitle && scene.type !== "chapter" ? (
        <Subtitle
          scene={scene}
          format={format}
          text={subtitle}
          top={scene.type === "outro" ? (format === "mobile" ? 1390 : 822) : undefined}
        />
      ) : null}
      {scene.voiceFile ? (
        <Sequence from={scene.voiceDelay} layout="none">
          <Audio src={staticFile(scene.voiceFile)} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
}

/**
 * Music level from measured loudness: 18 dB under the narration while it
 * speaks, 7 dB under it between lines, faded in and out. The finished file is
 * normalised to -16 LUFS afterwards (scripts/render.mjs).
 */
const gain = (targetLufs: number, sourceLufs: number) =>
  Math.pow(10, (targetLufs - sourceLufs) / 20);

function musicVolume(f: number, total: number, speech: [number, number][], musicLufs: number) {
  const fadeInOut = interpolate(f, [0, 20, total - 50, total - 2], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  let duck = 0;
  for (const [s, e] of speech) {
    duck = Math.max(
      duck,
      interpolate(f, [s - 8, s, e, e + 12], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    );
  }
  const bed = gain(script.voiceLufs - 7, musicLufs);
  const under = gain(script.voiceLufs - 18, musicLufs);
  return fadeInOut * (bed + (under - bed) * duck);
}

export function DemoVideo({ video, format }: DemoProps) {
  const { spec, scenes, total } = buildTimeline(video, format);
  const speech = scenes
    .filter((s) => s.voiceFile)
    .map((s) => [s.from + s.voiceDelay, s.from + s.voiceDelay + s.voiceFrames] as [number, number]);
  return (
    <AbsoluteFill>
      <Backdrop />
      <TransitionSeries>
        {scenes.map((scene, i) => {
          const next = scenes[i + 1];
          const presentation =
            next && scene.type === "clip" && next.type === "clip"
              ? slide({ direction: "from-right" })
              : fade();
          return (
            <Fragment key={scene.id}>
              <TransitionSeries.Sequence durationInFrames={scene.frames}>
                <SceneView
                  scene={scene}
                  format={format}
                  title={spec.title}
                  tagline={spec.tagline}
                  credit={spec.musicCredit}
                />
              </TransitionSeries.Sequence>
              {next ? (
                <TransitionSeries.Transition
                  presentation={presentation}
                  timing={linearTiming({ durationInFrames: TRANSITION })}
                />
              ) : null}
            </Fragment>
          );
        })}
      </TransitionSeries>
      <Audio
        src={staticFile(spec.music)}
        loop
        volume={(f) => musicVolume(f, total, speech, spec.musicLufs)}
      />
      <ProgressBar total={total} />
    </AbsoluteFill>
  );
}
