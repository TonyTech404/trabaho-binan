# Design system

How Trabaho Biñan looks and why. Tokens live in [`app/app.css`](../app/app.css); components
live in [`app/components/`](../app/components/). Change a token there, not in a component.

## Principles

- **Facts first.** A jobseeker decides on title, employer, location, pay and job type. Those
  come first and are the most legible things on the page. Deadlines, education and dates are
  secondary until they become urgent.
- **Plain paper, one bold place.** White pages, thin borders, no gradients or decorative
  imagery. The green "How to apply" panel on a job page is the one strong block of colour.
- **Works on a low-end phone.** 360px wide, slow connections, bright sunlight. Every page is
  checked at 360px and 1440px with no horizontal scrolling.
- **Accessible by default.** WCAG 2.2 AA contrast, a visible focus ring on every interactive
  element, full keyboard use, colour never the only signal.

## Colour

Proposed interface colours inspired by the updated Biñan city seal (deep green, gold, white).
They harmonise with the seal but are **not official city brand specifications**; if the City
publishes a brand guide, align these tokens with it.

| Token                    | Hex                   | Use                                                  | Contrast              |
| ------------------------ | --------------------- | ---------------------------------------------------- | --------------------- |
| `ink`                    | `#1A2620`             | Body text, headings                                  | 15.6:1 on white       |
| `ink-muted`              | `#48554D`             | Secondary text, hints                                | 7.8:1 on white        |
| `ink-subtle`             | `#5B6860`             | Icons, tertiary text                                 | 5.8:1 on white        |
| `canvas` / `surface`     | `#FFFFFF`             | Page and card background                             |                       |
| `wash`                   | `#F5F7F4`             | Quiet zones (fact footers, internal notes)           |                       |
| `line`                   | `#D6DDD7`             | Card borders, dividers                               | decorative            |
| `line-strong`            | `#7B877F`             | Input borders                                        | 3.7:1 (UI, ≥3:1)      |
| `pine`                   | `#1E5F24`             | Primary buttons, links, active icons                 | 7.7:1 on white        |
| `pine-strong`            | `#144419`             | Hover, text on `pine-tint`, apply-panel heading      | 11.2:1 with white     |
| `pine-tint`              | `#EAF3E7`             | Selected navigation, success badges                  |                       |
| `gold`                   | `#E8B923`             | Fills only: header rule, closing-soon border, counts | **1.8:1, never text** |
| `gold-tint`              | `#FDF3CF`             | Warning and closing-soon backgrounds                 |                       |
| `gold-ink`               | `#5C4300`             | Text on `gold-tint`                                  | 8.4:1 on gold-tint    |
| `danger` / `danger-tint` | `#B42318` / `#FDECEA` | Errors, destructive actions                          | 6.6:1 on white        |
| `focus`                  | `#0F3D1C`             | 3px focus outline, 2px offset                        | 12.3:1 on white       |

Rules:

- Never put `gold` text on white. Use `gold-ink` on `gold-tint`, or `ink` on `gold`.
- `success` badges are filled (`pine-tint`); `info` badges are outlined, so "Pending review"
  never looks like "Published".
- Hard-coded hex values belong only in `app.css`, SVG artwork and the `theme-color` meta tag.

## Typography

One family: **Source Sans 3**, self-hosted through `@fontsource/source-sans-3` at weights
**400, 600 and 700** only. Do not use `font-medium` (500) or other weights; they would fall
back to the nearest loaded weight.

| Role                      | Size (Tailwind)             | Weight |
| ------------------------- | --------------------------- | ------ |
| Page title (`h1`)         | `text-3xl`–`text-4xl`       | 700    |
| Job title on a job page   | 28px mobile → `text-4xl`    | 700    |
| Section heading           | `text-xl`–`text-2xl`        | 700    |
| Job title in a list       | `text-lg` → `text-xl` (sm+) | 600    |
| Body and form inputs      | `text-base` = 17px          | 400    |
| Labels, buttons, emphasis | `text-base` / `text-sm`     | 600    |
| Hints, metadata           | `text-sm` = 15px            | 400    |
| Badges                    | `text-xs` = 13px            | 600    |

- The 17px base keeps inputs above 16px, so iOS Safari does not zoom on focus.
- Figures are plain lining numerals (`font-variant-numeric: lining-nums`): no slashed zero in
  salaries or dates.
- Headings use normal width and `text-wrap: balance`; long titles wrap and never truncate on
  job pages (lists clamp at three lines).
- Keep the ñ in "Biñan" everywhere, including slugs shown to people, titles and metadata.
  Both ñ and the peso sign ₱ are in the Latin and Latin-ext subsets that the browser loads.
- Avoid all-caps labels and text set in gold.

## Spacing, shape and layout

- Tailwind's 4px scale. Cards use `px-4 py-3.5` on mobile and `px-5 py-4` from `sm`.
- Content width: `max-w-6xl` for public pages, `max-w-7xl` for dashboards; running text
  stays under about 68 characters (`.prose-job`).
- Radius: 4px badges, 6px inputs and buttons, 8px cards and panels.
- Touch targets are at least 44px (`min-h-11`, `h-11` inputs and buttons).
- Header: white with a 2px `gold` rule underneath, the one gold accent on every page.

## Components

| Component                     | File                               | Notes                                                                                                                            |
| ----------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Button / `buttonVariants`     | `components/ui/button.tsx`         | `default`, `outline`, `secondary`, `ghost`, `destructive(-outline)`, `link`. Use `buttonVariants()` for links styled as buttons. |
| Badge                         | `components/ui/badge.tsx`          | `neutral`, `info` (outlined), `success`, `warning`, `danger`. Text always names the state.                                       |
| Alert                         | `components/ui/alert.tsx`          | Left-border notice; `danger` gets `role="alert"`.                                                                                |
| Input, NativeSelect, Textarea | `components/ui/*`                  | Native controls (work without JavaScript).                                                                                       |
| Job card                      | `components/job/job-list-item.tsx` | Title → employer → location, pay, job type → education and closing date. The whole card is the link target.                      |
| Deadline note                 | `components/job/deadline.tsx`      | "Closes Nov 21" in muted text; a gold "Closes in 2 days" chip only in the last 3 days.                                           |
| Job facts                     | `components/job/job-meta.tsx`      | `Fact` centres its icon on the first line with a `1lh` box.                                                                      |
| Dashboard shell               | `components/dashboard/shell.tsx`   | Side navigation from `lg`, scrolling tab bar below.                                                                              |

## Icons

One library: **Lucide** (`lucide-react`), outline style, default 2px stroke.

- Sizes: 16px (`size-4`) inline with text, 18px in navigation, 20px in fact lists and headings.
- Decorative icons get `aria-hidden="true"`; an icon is never the only label for an action.
- Inline icons sit in a `1lh`-tall flex box (see `Fact`) so they stay centred on the first
  line at any font size.

## Accessibility checks

Run before merging UI changes:

1. axe (WCAG 2.2 AA tags) on public pages, both dashboards and forms at 360px and 1440px.
   The E2E suite (`npm run test:e2e`) includes axe checks.
2. Tab through the home page and a job page: the focus ring must be visible at every stop.
3. Check `document.documentElement.scrollWidth` equals the viewport width at 360px.
   Watch for absolutely positioned `sr-only` text inside `overflow-x-auto` containers: give
   the container `position: relative`.

## Logo

The site uses the **City of Biñan seal** and the **PESO Biñan logo**, with permission
confirmed by the project owner on 24 October 2026. `OfficialLogos` in
`app/components/wordmark.tsx` shows them side by side, followed by the name “Trabaho Biñan”
and “PESO Biñan”.

- Use the files in `app/assets/logos/` as supplied: scale them uniformly only. Never
  redraw, recolour, crop, stretch, outline or merge them into a new mark.
- Header: 32px tall on phones, 40px from `sm`. Footer and sign-in card: 48px.
- Inside the home link the logos are decorative (`alt=""`) because the link text names
  the office; elsewhere they have descriptive alt text.
- The favicon and Apple touch icon are the PESO logo, scaled.
- The logos are not covered by the repository's MIT licence.
