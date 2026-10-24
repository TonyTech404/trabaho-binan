import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Img,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, fontFamily, FPS, TRANSITION, type Format } from "../theme";
import type { TimedScene } from "../timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Deep green backdrop with a quiet gold accent, as on the site header. */
export function Backdrop() {
  return (
    <AbsoluteFill style={{ background: C.pineStrong }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 18% 12%, rgba(255,255,255,0.07), transparent 45%)`,
        }}
      />
    </AbsoluteFill>
  );
}

export function ProgressBar({ total }: { total: number }) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        height: 6,
        width: `${(frame / total) * 100}%`,
        background: C.gold,
      }}
    />
  );
}

function Logos({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", gap: size * 0.18, alignItems: "center" }}>
      <Img src={staticFile("logos/seal.png")} style={{ width: size, height: size }} />
      <Img src={staticFile("logos/peso.png")} style={{ width: size, height: size }} />
    </div>
  );
}

const pop = (frame: number, fps: number, delay: number) =>
  spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 120, mass: 0.7 } });

export function Intro({
  title,
  tagline,
  format,
}: {
  title: string;
  tagline: string;
  format: Format;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = format === "mobile";
  const logo = pop(frame, fps, 0);
  const head = pop(frame, fps, 8);
  const line = interpolate(frame, [18, 34], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const sub = interpolate(frame, [24, 38], [0, 1], clamp);
  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", fontFamily, color: C.white }}
    >
      <div style={{ transform: `scale(${0.6 + 0.4 * logo})`, opacity: logo }}>
        <Logos size={m ? 210 : 170} />
      </div>
      <div
        style={{
          marginTop: m ? 56 : 40,
          fontSize: m ? 124 : 132,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          transform: `translateY(${(1 - head) * 50}px)`,
          opacity: head,
        }}
      >
        Trabaho Biñan
      </div>
      <div
        style={{
          height: 8,
          width: (m ? 300 : 340) * line,
          background: C.gold,
          borderRadius: 4,
          marginTop: 10,
        }}
      />
      <div style={{ opacity: sub, marginTop: m ? 44 : 30, textAlign: "center", padding: "0 60px" }}>
        <div style={{ fontSize: m ? 62 : 56, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: m ? 42 : 36, color: C.goldTint, marginTop: 10 }}>{tagline}</div>
      </div>
    </AbsoluteFill>
  );
}

const ICONS: Record<string, ReactNode> = {
  building: (
    <>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
    </>
  ),
  check: (
    <>
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  inbox: (
    <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  shield: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

export function Chapter({ label, icon, format }: { label: string; icon: string; format: Format }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = format === "mobile";
  const bar = interpolate(frame, [0, 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const ic = pop(frame, fps, 4);
  const text = pop(frame, fps, 8);
  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", fontFamily, color: C.white }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: m ? "column" : "row",
          alignItems: "center",
          gap: m ? 36 : 44,
        }}
      >
        <div
          style={{
            width: m ? 200 : 170,
            height: m ? 200 : 170,
            borderRadius: 40,
            background: C.gold,
            display: "grid",
            placeItems: "center",
            transform: `scale(${ic}) rotate(${(1 - ic) * -12}deg)`,
          }}
        >
          <svg
            width={m ? 116 : 98}
            height={m ? 116 : 98}
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.pineDeep}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {ICONS[icon]}
          </svg>
        </div>
        <div
          style={{
            fontSize: m ? 104 : 116,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            transform: `translateX(${m ? 0 : (1 - text) * 60}px) translateY(${m ? (1 - text) * 40 : 0}px)`,
            opacity: text,
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: m ? 360 : 230,
          height: 8,
          width: 420 * bar,
          background: C.gold,
          borderRadius: 4,
        }}
      />
    </AbsoluteFill>
  );
}

export function Outro({
  format,
  credit,
  closing,
}: {
  format: Format;
  credit: string;
  closing: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = format === "mobile";
  const a = pop(frame, fps, 0);
  const b = pop(frame, fps, 10);
  const c = interpolate(frame, [26, 40], [0, 1], clamp);
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
        color: C.white,
        textAlign: "center",
      }}
    >
      <div style={{ transform: `scale(${0.7 + 0.3 * a})`, opacity: a }}>
        <Logos size={m ? 150 : 120} />
      </div>
      <div
        style={{
          marginTop: m ? 50 : 34,
          fontSize: m ? 70 : 88,
          fontWeight: 700,
          opacity: b,
          transform: `translateY(${(1 - b) * 30}px)`,
        }}
      >
        trabaho.bantaybinan.com
      </div>
      <div
        style={{
          height: 8,
          width: (m ? 520 : 640) * b,
          background: C.gold,
          borderRadius: 4,
          marginTop: 12,
        }}
      />
      <div
        style={{
          marginTop: m ? 48 : 34,
          fontSize: m ? 44 : 38,
          color: C.goldTint,
          opacity: c,
          padding: "0 60px",
        }}
      >
        {closing}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: m ? 70 : 34,
          fontSize: m ? 26 : 21,
          lineHeight: 1.5,
          color: "rgba(255,255,255,0.72)",
          opacity: c,
          padding: "0 60px",
        }}
      >
        PESO Biñan, City Government of Biñan. Recorded on the live site; listings marked DEMO are
        not real vacancies.
        <br />
        Music: {credit}. Narration: Kokoro TTS (Apache-2.0).
      </div>
    </AbsoluteFill>
  );
}

export function Headline({ text, format }: { text: string; format: Format }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = format === "mobile";
  const words = text.split(" ");
  return (
    <div
      style={{
        position: "absolute",
        fontFamily,
        color: C.white,
        fontWeight: 700,
        letterSpacing: "-0.015em",
        ...(m
          ? { top: 96, left: 60, right: 60, fontSize: 62, lineHeight: 1.12, textAlign: "center" }
          : {
              top: 30,
              left: 240,
              fontSize: 50,
              lineHeight: 1.1,
              display: "flex",
              alignItems: "center",
              gap: 18,
            }),
      }}
    >
      {m ? null : (
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 46,
            borderRadius: 4,
            background: C.gold,
            transform: `scaleY(${interpolate(frame, [0, 10], [0, 1], clamp)})`,
          }}
        />
      )}
      <span>
        {words.map((w, i) => {
          const s = spring({
            frame: frame - 6 - i * 3,
            fps,
            config: { damping: 16, stiffness: 140 },
          });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: "0.26em",
                opacity: s,
                transform: `translateY(${(1 - s) * 24}px)`,
              }}
            >
              {w}
            </span>
          );
        })}
      </span>
    </div>
  );
}

export function Subtitle({
  scene,
  format,
  text,
  top,
}: {
  scene: TimedScene;
  format: Format;
  text: string;
  /** Overrides the usual position (the outro keeps the bottom free for credits). */
  top?: number;
}) {
  const frame = useCurrentFrame();
  const m = format === "mobile";
  const start = scene.voiceDelay;
  const end = scene.voiceDelay + scene.voiceFrames + 8;
  const o = interpolate(frame, [start - 2, start + 6, end, end + 8], [0, 1, 1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity: o,
        fontFamily,
        top: top ?? (m ? 1750 : 984),
      }}
    >
      <div
        style={{
          maxWidth: m ? 960 : 1460,
          textAlign: "center",
          color: C.white,
          fontSize: m ? 38 : 33,
          lineHeight: 1.3,
          fontWeight: 600,
          textShadow: "0 2px 8px rgba(0,0,0,0.35)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

/** The recorded clip, sped up to fit and held on its last frame, with an optional zoom. */
function ClipContent({
  scene,
  width,
  height,
  format,
}: {
  scene: TimedScene;
  width: number;
  height: number;
  format: Format;
}) {
  const frame = useCurrentFrame();
  const clip = scene.clipData!;
  const playable = Math.floor((clip.duration * FPS) / scene.rate) - 2;
  const video = (
    <OffthreadVideo
      src={staticFile(clip.file)}
      playbackRate={scene.rate}
      muted
      style={{ width, height, display: "block" }}
    />
  );
  let transform = `scale(${interpolate(frame, [0, scene.frames], [1, 1.02])})`;
  let origin = "50% 50%";
  const mark = scene.zoom
    ? clip.marks.find((x) => x.label === scene.zoom!.mark && x.box)
    : undefined;
  if (mark?.box) {
    const at = (mark.t * FPS) / scene.rate;
    // Phones: no zoom (the page's narrow side gutters would be cropped). Ease out after ~2 s.
    const peak = format === "mobile" ? 1.02 : scene.zoom!.scale;
    const out = Math.min(at + 16 + 60 + 16, scene.frames - TRANSITION - 4);
    const z = interpolate(
      frame,
      [at - 6, at + 16, Math.max(at + 17, out - 16), Math.max(at + 18, out)],
      [1, peak, peak, 1],
      { ...clamp, easing: Easing.inOut(Easing.cubic) },
    );
    const cx = ((mark.box.x + mark.box.width / 2) / mark.viewport.width) * 100;
    const cy = ((mark.box.y + mark.box.height / 2) / mark.viewport.height) * 100;
    transform = `scale(${z})`;
    origin = `${Math.min(Math.max(cx, 20), 80)}% ${Math.min(Math.max(cy, 20), 80)}%`;
  }
  return (
    <div style={{ width, height, overflow: "hidden", position: "relative", background: C.white }}>
      <div style={{ width, height, transform, transformOrigin: origin }}>
        {frame < playable ? video : <Freeze frame={playable}>{video}</Freeze>}
      </div>
    </div>
  );
}

export function BrowserFrame({ scene }: { scene: TimedScene }) {
  const path = scene.url ?? "/";
  return (
    <div
      style={{
        position: "absolute",
        left: 240,
        top: 118,
        width: 1440,
        borderRadius: 18,
        overflow: "hidden",
        background: C.white,
        boxShadow: "0 30px 80px rgba(0,0,0,0.38)",
      }}
    >
      <div
        style={{
          height: 46,
          background: "#eef1ee",
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 18px",
          borderBottom: "1px solid #dbe2db",
          fontFamily,
        }}
      >
        {["#e0665b", "#e8b923", "#5aa45f"].map((c) => (
          <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
        <div
          style={{
            marginLeft: 22,
            height: 30,
            flex: 1,
            maxWidth: 820,
            borderRadius: 15,
            background: C.white,
            border: "1px solid #d6ddd7",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            fontSize: 17,
            color: "#48554d",
            gap: 8,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#48554d"
            strokeWidth="2.4"
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span style={{ color: C.ink, fontWeight: 600 }}>trabaho.bantaybinan.com</span>
          <span>{path === "/" ? "" : path}</span>
        </div>
      </div>
      <ClipContent scene={scene} width={1440} height={810} format="desktop" />
    </div>
  );
}

export function PhoneFrame({ scene }: { scene: TimedScene }) {
  const screenW = 663;
  const screenH = Math.round((screenW * 2532) / 1170);
  return (
    <div
      style={{
        position: "absolute",
        left: (1080 - (screenW + 36)) / 2,
        top: 262,
        padding: 18,
        borderRadius: 84,
        background: "#0b120d",
        boxShadow: "0 40px 90px rgba(0,0,0,0.45), inset 0 0 0 2px #2b3a2f",
      }}
    >
      <div style={{ borderRadius: 66, overflow: "hidden" }}>
        <ClipContent scene={scene} width={screenW} height={screenH} format="mobile" />
      </div>
    </div>
  );
}
