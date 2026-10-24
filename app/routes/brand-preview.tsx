import { data } from "react-router";
import {
  ConceptGlyph,
  ConceptLockup,
  LOGO_CONCEPTS,
  type LogoConcept,
} from "~/components/brand/logo-concepts";
import { SiteHeader, SkipLink } from "~/components/site-chrome";
import { getServices } from "~/lib/context.server";
import type { Route } from "./+types/brand-preview";

/** Logo concepts for the owner to compare. Never served in production. */
export function loader({ context }: Route.LoaderArgs) {
  if (getServices(context).env.APP_ENV === "production") {
    throw data("Not found", { status: 404 });
  }
  return null;
}

export function meta() {
  return [
    { title: "Logo concepts — Trabaho Biñan" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

function FaviconSizes({
  src,
  label,
  glyph,
}: {
  src: string;
  label: string;
  glyph?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 text-sm text-ink-muted">
      <figure className="space-y-1.5">
        {/* A browser tab at real size: the icon is drawn at 16 CSS pixels. */}
        <div className="flex h-9 w-60 items-center gap-2 rounded-t-lg border border-b-0 border-line bg-muted px-3">
          <img src={src} width={16} height={16} alt="" />
          <span className="truncate text-xs text-ink">Jobs in Biñan — Trabaho Biñan</span>
        </div>
        <figcaption>16px in a browser tab</figcaption>
      </figure>
      <figure className="space-y-1.5">
        <div className="flex h-9 items-center rounded-md bg-ink px-2.5">
          <img src={src} width={16} height={16} alt="" />
        </div>
        <figcaption>16px, dark tab</figcaption>
      </figure>
      <figure className="space-y-1.5">
        <img src={src} width={32} height={32} alt={`${label} icon at 32 pixels`} />
        <figcaption>32px</figcaption>
      </figure>
      {glyph ? (
        <figure className="space-y-1.5">
          <div className="flex gap-3">
            <span className="text-pine">{glyph}</span>
            <span className="text-ink">{glyph}</span>
          </div>
          <figcaption>One-colour glyph</figcaption>
        </figure>
      ) : null}
    </div>
  );
}

function ConceptSection({
  title,
  description,
  brand,
  favicon,
  glyph,
  notes,
}: {
  title: string;
  description: string;
  brand?: React.ReactNode;
  favicon: string;
  glyph?: React.ReactNode;
  notes?: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-line pt-8" aria-label={title}>
      <div className="max-w-3xl space-y-1">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="text-ink-muted">{description}</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        <SiteHeader viewer={null} brand={brand} />
        <div className="h-6 bg-wash" />
      </div>
      <FaviconSizes src={favicon} label={title} glyph={glyph} />
      {notes}
    </section>
  );
}

function ConceptNotes({ concept }: { concept: LogoConcept }) {
  return (
    <dl className="grid max-w-3xl gap-3 sm:grid-cols-2">
      <div>
        <dt className="font-semibold">Strengths</dt>
        <dd className="text-ink-muted">{concept.strengths}</dd>
      </div>
      <div>
        <dt className="font-semibold">Risks</dt>
        <dd className="text-ink-muted">{concept.risks}</dd>
      </div>
    </dl>
  );
}

export default function BrandPreview() {
  return (
    <>
      <SkipLink />
      <main id="main" className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <header className="max-w-3xl space-y-3">
          <h1 className="text-3xl font-bold">Logo concepts</h1>
          <p className="text-lg text-ink-muted">
            Three original concepts for Trabaho Biñan, each shown in the real site header in one
            colour and as a browser icon. The current mark stays on the site until one is chosen.
          </p>
          <p className="text-sm text-ink-muted">
            None of these use or imitate the City of Biñan seal or the PESO logo, and none imply an
            official endorsement. This page is not available on the production site.
          </p>
        </header>

        {LOGO_CONCEPTS.map((concept, i) => (
          <ConceptSection
            key={concept.id}
            title={`Option ${i + 1}: ${concept.name}`}
            description={concept.idea}
            brand={<ConceptLockup concept={concept} />}
            favicon={concept.favicon}
            glyph={<ConceptGlyph concept={concept} className="size-8" />}
            notes={<ConceptNotes concept={concept} />}
          />
        ))}

        <ConceptSection
          title="Current mark (for comparison)"
          description="The interim notice-with-tab mark now in use, recoloured to the new palette."
          favicon="/favicon.svg"
        />

        <section aria-labelledby="recommendation" className="border-t border-line pt-8">
          <div className="max-w-3xl space-y-3 rounded-lg border-l-4 border-pine bg-pine-tint px-5 py-4">
            <h2 id="recommendation" className="text-2xl font-bold">
              Recommendation: Option 3, the ñ
            </h2>
            <p>
              It is the most legible at 16px, the concept most specific to Biñan, and it is built
              from the site’s own typeface, so the header, documents and printed notices stay
              consistent without extra artwork. The TB monogram is the weakest choice for a public
              audience because of the tuberculosis association. If a pictorial symbol is preferred,
              the open doorway is the stronger alternative.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
