# Progress log

Working log for the first release. Update it whenever a coherent piece of work
lands, so another session can resume accurately.

## Current status (2026-10-24)

**Branch:** `feat/first-release`. Not yet pushed; the owner approved pushing to
the public repository and opening a draft PR after the secret scan.

**Working tree:** a second Claude session (`trabaho-binan-e7`) is applying
owner-requested branding in the same checkout: palette, fonts (Source Sans 3),
logo, `docs/design-system.md`, `docs/brand/*`, `/brand-preview`. Stage
explicit paths only. Production deploy is on hold until its branding commit
lands.

### Done

- **Foundation:** React Router 8 on Cloudflare Workers (Vite plugin), Tailwind
  CSS 4 and shadcn/ui, TypeScript, ESLint 9 + jsx-a11y, Prettier.
- **Database:** Drizzle schema and migrations `0000` (pgcrypto) and `0001`
  (initial schema), applied to local, staging and production. Restricted
  runtime role `trabaho_app` on every database; history tables are
  append-only for it.
- **Services:** job lifecycle and reviewed revisions, organizations and
  verification/suspension, invitations and reset links, reports, public
  search, expiry sweep, metrics, users, audit, settings, CSV export.
- **Public site:** directory with search and filters, job pages, apply
  redirect that re-checks status, report form, employer profiles,
  help/safety, privacy, sitemap, robots.
- **Dashboards:** reviewer/admin (overview, review queue, jobs, employers,
  reports, users and access, audit, settings), employer (jobs, submit, revise,
  close, profile), account/password.
- **Security:** nonce CSP and headers, cross-site post rejection, Better Auth
  without public routes, bcrypt in PostgreSQL, fresh sessions, rate limiting,
  private/no-store for signed-in responses, public-page edge cache with purge.
- **Tests:** 69 Vitest tests (unit + integration against PostgreSQL),
  passing. Playwright suite written: 32 of 43 passed on the first run; the
  failures were test selectors, an AA contrast failure on the green badge
  token, and a wrangler env-var issue (fixed by the environment restructure).
  Re-run after the branding lands.
- **Ops:** CI workflow, MIT licence, `.env.example`, administrator invitation
  script, encrypted backup/restore scripts (restore drill passed on staging:
  row counts matched; non-empty target refused), README, CONTRIBUTING,
  SECURITY, architecture and operations guides.

### Next

1. After the branding commit: re-run the Playwright suite and fix failures;
   visual inspection at 360/768/1440 of public pages and dashboards; README
   screenshots.
2. Add `tsc -p tsconfig.tools.json` to the `typecheck` script (`package.json`
   is being committed by the branding session).
3. Deploy staging, re-measure Worker CPU with the full UI.
4. Production: set secret, deploy (custom domain), create the first admin
   invitation with `--mark-environment production`, smoke-test, production
   backup, record the deployed commit here.
5. Secret scan of the full history, push, draft PR.

## Resources

| Resource                                                 | Identifier                         | Plan                        |
| -------------------------------------------------------- | ---------------------------------- | --------------------------- |
| Neon project `trabaho-binan` (aws-ap-southeast-1, PG 18) | `sweet-frost-27860793`             | Free (pre-existing, reused) |
| Neon branch `production` (default)                       | `br-blue-fire-b3go6619`            | Free                        |
| Neon branch `staging` (synthetic data)                   | `br-flat-heart-b3j4hm3v`           | Free                        |
| Hyperdrive `trabaho-binan-production` (caching disabled) | `b572c139ba864a67817c7a527bf3a9d9` | Free                        |
| Hyperdrive `trabaho-binan-staging` (caching disabled)    | `03f35acb820b4021a930c8e9f24d29f5` | Free                        |
| Worker `trabaho-binan-staging` (workers.dev)             | —                                  | Workers Free                |
| Worker `trabaho-binan` (trabaho.bantaybinan.com)         | not yet deployed                   | Workers Free                |

Credentials live only in Cloudflare (Hyperdrive, Worker secrets) and in the
developer's ignored `.secrets/` directory. Nothing secret is committed.

## Decisions

See also [architecture.md](architecture.md#decisions-log).

- **Password hashing in PostgreSQL** (pgcrypto bcrypt, cost 10). Keeps the
  hashing off the Workers Free 10 ms CPU budget.
- **No transactional email.** Cloudflare Email Sending needs Workers Paid for
  arbitrary recipients. Invitation and reset links are shown once to staff.
- **Better Auth HTTP handler not mounted**; public sign-up disabled.
- **No session cookie cache**: suspensions and role changes apply immediately.
- **One cron trigger, production only** (the account limit is 5; 2 are used elsewhere).
- **Hyperdrive query caching disabled** (plan §10).
- **One organization per employer account** in the first release.
- **All employer edits to live listings are reviewed**; staff can correct directly (audited).
- **Administrators include reviewer permissions** for the pilot.
- **No PESO/City affiliation claims** in the UI; the operator name is a setting.
  The owner-supplied seal and PESO logo files in the repository root are not
  used or committed.
- **Wrangler environments:** top level = local only; `env.staging` and
  `env.production` are explicit.
- **Licence:** MIT (owner decision, 2026-10-24).

## Workers CPU findings (staging, 2026-10-24, spike build)

Measured with `wrangler tail` (`cpuTime` per invocation):

| Route                             | Warm    | Observed range | Notes                                          |
| --------------------------------- | ------- | -------------- | ---------------------------------------------- |
| Cached public page                | 2–6 ms  | 2–6 ms         | Edge cache hit                                 |
| `/healthz` (connect + `select 1`) | 3–5 ms  | 0–36 ms        | Framework ≈1 ms, DB connect ≈2 ms              |
| Home with search (uncached)       | 9–15 ms | 9–153 ms       | 2 queries + SSR                                |
| Session check                     | ~7 ms   | 7–111 ms       | Better Auth session lookup                     |
| Sign-in                           | ~16 ms  | 16–118 ms      | bcrypt runs in PostgreSQL (wall time, not CPU) |

No invocation was terminated (`outcome: ok` for all ~400 samples), but cold and
warming instances regularly exceed 10 ms. The same build measured 0.6–8 ms
warm in Node. Re-measure with the full UI. If uncached paths stay above budget,
the options are further optimisation or Workers Paid (US$5/month). That is
**an owner decision and must not be enabled without approval.**

## Restore drills

| Date       | Source                     | Target                                                     | Result                                                                                      |
| ---------- | -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 2026-10-24 | Neon `staging` (synthetic) | Empty `restore_drill` DB on staging branch (dropped after) | Passed: checksum OK; users 4, organizations 5, jobs 15, audit events 49, migrations 2 match |

## Blockers / open items for the owner

- Branding session in progress (see above).
- After launch, enable GitHub private vulnerability reporting (SECURITY.md relies on it).
