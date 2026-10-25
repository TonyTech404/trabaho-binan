# Demo videos

Two short narrated demo videos, each in a desktop (1920×1080) and a mobile
(1080×1920) version:

| Composition    | For                                          | Length |
| -------------- | -------------------------------------------- | ------ |
| `jobseeker-*`  | Residents looking for work                   | ~57 s  |
| `backoffice-*` | Employers, PESO reviewers and administrators | ~86 s  |

Everything is recorded from the live site, so the videos show the real product.

## How they are made

1. **Demo data** (`scripts/demo-setup.ts`): creates demo accounts (administrator,
   PESO reviewer, employer) and a fictional "Demo Bakeshop (not a real company)".
   Passwords go to `../.secrets/demo-accounts.json`.
2. **Capture** (`scripts/capture.mjs desktop|mobile`): Playwright drives the site
   while the Chrome DevTools screencast records sharp frames (2× desktop, 3×
   mobile). A visible cursor and tap ripples are drawn into the page. Each scene
   becomes an MP4 plus the positions of key elements, used for zooms. The employer
   posts a job titled "… (DEMO – not a real vacancy)", which is public while
   recording. A fictional applicant applies with a photo of a sample résumé and
   checks their status; a second one applies off camera. Both use `0900`
   numbers, which is not an assigned Philippine mobile prefix. The employer then
   hires the first, which closes the job, and the PESO overview shows the hire.
3. **Clean-up** (`scripts/demo-cleanup.ts`, run straight after each capture):
   closes and archives the demo jobs, deletes demo applications and their files
   from R2 (so the demo hire leaves the placement count), and suspends the demo
   company and accounts.
4. **Narration** (`scripts/narrate.mjs`): Kokoro TTS (Apache-2.0), voice
   `af_heart`, from `src/data/script.json`. `scripts/check-narration.mjs`
   transcribes every line with Whisper to catch garbled words. No suitable open
   Filipino voice exists (Meta's MMS Tagalog model is dated and non-commercial),
   so the narration is in English; names use plain-English respellings
   ("Been-yahn" for Biñan).
5. **Render** (`scripts/stage-footage.mjs`, then `scripts/render.mjs`): Remotion
   composes the intro, chapter cards, browser or phone frames, zooms, kinetic
   headlines, burned-in subtitles, music ducked under the voice, and the outro.
   Scenes dissolve into each other: between two clips the frame stays still and
   only the page changes, and title cards fade through the green backdrop.

```sh
cd video && npm install
# From the repository root, against production. Each format gets a clean start.
setup="npx tsx --tsconfig tsconfig.cloudflare.json video/scripts/demo-setup.ts"
cleanup="npx tsx --tsconfig tsconfig.cloudflare.json video/scripts/demo-cleanup.ts"
export DATABASE_URL="$PRODUCTION_APP_URL" R2_BUCKET=trabaho-binan-resumes
for format in desktop mobile; do
  $setup && (cd video && node scripts/capture.mjs $format); $cleanup
done
cd video
node scripts/narrate.mjs && node scripts/check-narration.mjs
# Music: download "Easy Lemon" and "Inspired" (Kevin MacLeod, incompetech.com)
# to public/music/easy-lemon.mp3 and public/music/inspired.mp3. Logos go to
# public/logos/seal.png and public/logos/peso.png (512 px, scaled only).
node scripts/stage-footage.mjs && node scripts/render.mjs
```

Edit the wording in `src/data/script.json` and re-run `narrate.mjs` and
`render.mjs`; scenes resize to fit the new narration. `npm run studio` opens
Remotion Studio for previewing.

## Credits and licences

- Music: “Easy Lemon” and “Inspired” by Kevin MacLeod (incompetech.com), CC BY 4.0.
  The credit is shown in each video's end card; keep it when you post them.
- Narration: Kokoro-82M (Apache-2.0). Transcription check: Whisper (MIT).
- Remotion is free for individuals and organisations of up to three people;
  check its licence if a larger organisation takes over rendering.
- The PESO logo and City of Biñan seal are used with permission and are not
  covered by this repository's licence.
