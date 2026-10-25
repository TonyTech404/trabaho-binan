import {
  linearTiming,
  TransitionSeries,
  type TransitionPresentation,
  type TransitionPresentationComponentProps,
} from "@remotion/transitions";
import { Fragment } from "react";
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, staticFile } from "remotion";
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

type DissolveProps = { through: boolean };

/**
 * Between two clips the browser or phone frame sits in the same place, so the
 * next clip fades in over the current one (which stays put underneath) and
 * only the page inside the frame changes. Every scene paints its own backdrop,
 * so nothing shows through or pops at the end.
 *
 * To and from title cards the scenes fade through the shared green backdrop
 * instead, so big titles never overlap a page, and the new scene settles from
 * a slight zoom.
 */
function Dissolve({
  children,
  presentationDirection,
  presentationProgress: p,
  passedProps,
}: TransitionPresentationComponentProps<DissolveProps>) {
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  if (presentationDirection === "exiting") {
    const opacity = passedProps.through ? interpolate(p, [0, 0.52], [1, 0], clamp) : 1;
    return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
  }
  const opacity = passedProps.through ? interpolate(p, [0.48, 1], [0, 1], clamp) : p;
  const scale = passedProps.through ? 1 + 0.035 * (1 - p) : 1;
  return <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>{children}</AbsoluteFill>;
}

const dissolve = (through: boolean): TransitionPresentation<DissolveProps> => ({
  component: Dissolve,
  props: { through },
});
const timing = linearTiming({ durationInFrames: TRANSITION, easing: Easing.inOut(Easing.sin) });

function SceneView({
  scene,
  format,
  title,
  tagline,
  credit,
  afterClip,
  beforeClip,
}: {
  scene: TimedScene;
  format: Format;
  title: string;
  tagline: string;
  credit: string;
  afterClip: boolean;
  beforeClip: boolean;
}) {
  const subtitle = scene.subtitle ?? scene.voice;
  return (
    <AbsoluteFill>
      <Backdrop />
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
          <Headline
            text={scene.headline ?? ""}
            format={format}
            continued={afterClip}
            fadeOutAt={beforeClip ? scene.frames - TRANSITION : undefined}
          />
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
          const prev = scenes[i - 1];
          const next = scenes[i + 1];
          const clipToClip = scene.type === "clip" && next?.type === "clip";
          return (
            <Fragment key={scene.id}>
              <TransitionSeries.Sequence durationInFrames={scene.frames}>
                <SceneView
                  scene={scene}
                  format={format}
                  title={spec.title}
                  tagline={spec.tagline}
                  credit={spec.musicCredit}
                  afterClip={scene.type === "clip" && prev?.type === "clip"}
                  beforeClip={clipToClip}
                />
              </TransitionSeries.Sequence>
              {next ? (
                <TransitionSeries.Transition presentation={dissolve(!clipToClip)} timing={timing} />
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
