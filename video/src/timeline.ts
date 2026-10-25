import desktopFootage from "./data/footage-desktop.json";
import mobileFootage from "./data/footage-mobile.json";
import narration from "./data/narration.json";
import script from "./data/script.json";
import { FPS, TRANSITION, type Format } from "./theme";

export type VideoId = keyof typeof script.videos;

interface Mark {
  label: string;
  t: number;
  box: { x: number; y: number; width: number; height: number } | null;
  viewport: { width: number; height: number };
}
interface Clip {
  file: string;
  duration: number;
  marks: Mark[];
}
export interface SceneSpec {
  id: string;
  type: "intro" | "chapter" | "clip" | "outro";
  clip?: string;
  url?: string;
  headline?: string;
  voice?: string;
  subtitle?: string;
  label?: string;
  icon?: string;
  zoom?: { mark: string; scale: number };
}
export interface TimedScene extends SceneSpec {
  from: number; // absolute start frame
  frames: number; // duration in frames (including the outgoing transition overlap)
  voiceFile?: string;
  voiceFrames: number;
  voiceDelay: number;
  clipData?: Clip;
  rate: number; // clip playback rate
}

const VOICE_DELAY = 12;

export function buildTimeline(video: VideoId, format: Format) {
  const footage = (format === "desktop" ? desktopFootage : mobileFootage) as Record<string, Clip>;
  const spec = script.videos[video];
  const scenes: TimedScene[] = [];
  let cursor = 0;
  for (const raw of spec.scenes as SceneSpec[]) {
    const voice = (narration as Record<string, { file: string; seconds: number }>)[raw.id];
    const voiceFrames = voice ? Math.ceil(voice.seconds * FPS) : 0;
    let frames: number;
    let rate = 1;
    let clipData: Clip | undefined;
    if (raw.type === "intro") frames = Math.max(voiceFrames + VOICE_DELAY + 30, 4 * FPS);
    else if (raw.type === "chapter") frames = Math.round(1.7 * FPS);
    else if (raw.type === "outro") frames = Math.max(voiceFrames + VOICE_DELAY + 75, 6 * FPS);
    else {
      clipData = footage[raw.clip!];
      if (!clipData) throw new Error(`Missing footage for ${raw.clip} (${format})`);
      // Long enough for the line plus a breath; clips are sped up to fit, never cut.
      const minFrames = voiceFrames + VOICE_DELAY + 18;
      const clipFrames = clipData.duration * FPS;
      rate = Math.min(Math.max(clipFrames / minFrames, 1), 2.6);
      frames = Math.max(minFrames, Math.ceil(clipFrames / rate), 3 * FPS);
    }
    frames += TRANSITION; // the next scene overlaps the end of this one
    scenes.push({
      ...raw,
      from: cursor,
      frames,
      voiceFile: voice?.file,
      voiceFrames,
      voiceDelay: VOICE_DELAY,
      clipData,
      rate,
    });
    cursor += frames - TRANSITION;
  }
  const total = cursor + TRANSITION;
  return { spec, scenes, total };
}
