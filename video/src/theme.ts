import { loadFont } from "@remotion/google-fonts/SourceSans3";

// Same typeface and palette as the site (docs/design-system.md).
export const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin", "latin-ext"],
});

export const C = {
  pine: "#1e5f24",
  pineStrong: "#144419",
  pineDeep: "#0f3d1c",
  pineTint: "#eaf3e7",
  gold: "#e8b923",
  goldTint: "#fdf3cf",
  ink: "#1a2620",
  white: "#ffffff",
};

export const FPS = 30;
export const TRANSITION = 20; // frames each transition overlaps (0.67 s)

export type Format = "desktop" | "mobile";
export const SIZE: Record<Format, { width: number; height: number }> = {
  desktop: { width: 1920, height: 1080 },
  mobile: { width: 1080, height: 1920 },
};
