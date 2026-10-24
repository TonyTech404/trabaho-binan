import doorwayFavicon from "~/assets/brand/doorway-favicon.svg?url";
import doorwayMark from "~/assets/brand/doorway-mark.svg?raw";
import enyeFavicon from "~/assets/brand/enye-favicon.svg?url";
import enyeMark from "~/assets/brand/enye-mark.svg?raw";
import monogramFavicon from "~/assets/brand/monogram-favicon.svg?url";
import monogramMark from "~/assets/brand/monogram-mark.svg?raw";
import { cn } from "~/lib/utils";

/**
 * Candidate identities for Trabaho Biñan, shown on /brand-preview until the
 * owner chooses one. Original drawings: nothing is taken from the city seal or
 * the PESO logo. Each mark is a single colour (currentColor).
 */
export interface LogoConcept {
  id: "monogram" | "doorway" | "enye";
  name: string;
  idea: string;
  strengths: string;
  risks: string;
  /** One-colour glyph: inline SVG markup that draws in currentColor. */
  glyph: string;
  /** Whether the header lockup shows the glyph or the name alone. */
  glyphInHeader: boolean;
  favicon: string;
}

export const LOGO_CONCEPTS: LogoConcept[] = [
  {
    id: "monogram",
    name: "TB monogram",
    idea: "A T whose crossbar runs over a B that shares its stem: Trabaho and Biñan in one figure.",
    strengths: "Compact and legible down to 16px. Works as a stamp on printed notices.",
    risks:
      "In the Philippines “TB” is strongly associated with tuberculosis campaigns. Letter monograms are also common, so it is the least distinctive option.",
    glyph: monogramMark,
    glyphInHeader: true,
    favicon: monogramFavicon,
  },
  {
    id: "doorway",
    name: "Open doorway",
    idea: "An arched doorway with its door swung open: a way in to work, drawn as one quiet symbol.",
    strengths: "Says “opportunity” without words and without stock job icons such as briefcases.",
    risks:
      "Below 24px the open door reads mostly as an arch. Doorway symbols are used by housing and real-estate brands.",
    glyph: doorwayMark,
    glyphInHeader: true,
    favicon: doorwayFavicon,
  },
  {
    id: "enye",
    name: "The ñ (typography-led)",
    idea: "The name set plainly in Source Sans 3 Bold; the icon is the ñ alone, with a hand-drawn tilde. The ñ is what makes “Biñan” unmistakable.",
    strengths:
      "Most distinctive and the clearest at 16px. Uses the site’s own typeface, so it needs no extra artwork and stays consistent everywhere.",
    risks:
      "The icon says “Biñan” rather than “jobs”; the word Trabaho carries that meaning. The tilde must not be redrawn loosely, or it loses its character.",
    glyph: enyeMark,
    glyphInHeader: false,
    favicon: enyeFavicon,
  },
];

export function ConceptGlyph({ concept, className }: { concept: LogoConcept; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 [&>svg]:size-full", className)}
      // Trusted, build-time SVG from app/assets/brand.
      dangerouslySetInnerHTML={{ __html: concept.glyph }}
    />
  );
}

/** The lockup as it would sit in the site header: one colour, mark then name. */
export function ConceptLockup({ concept }: { concept: LogoConcept }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-2 text-pine">
      {concept.glyphInHeader ? <ConceptGlyph concept={concept} className="size-8" /> : null}
      <span
        className={cn(
          "leading-none font-bold whitespace-nowrap",
          concept.glyphInHeader ? "text-xl tracking-[-0.01em]" : "text-[1.5rem] tracking-[-0.02em]",
        )}
      >
        Trabaho Biñan
      </span>
    </span>
  );
}
