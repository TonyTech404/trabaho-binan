# Progress log

Working log for the first release. Update it whenever a coherent piece of work
lands, so another session can resume accurately.

## Current status (2026-10-24)

**Production:** live at https://trabaho.bantaybinan.com.

- Deployed commit `7e98ecd` from branch `feat/first-release`.
- Worker `trabaho-binan`, version `70261148-5934-4495-a1a1-9674d57c4bfc`.
- Staging runs the same commit (version `6e33efc2-6e2a-4def-947c-4f7d9a6d7c4f`).

**Branch:** `feat/first-release`. The owner approved pushing to the public
GitHub repository and opening a draft PR after the secret scan.

**Branding:** applied by a parallel session (`trabaho-binan-e7`): green/gold
palette and Source Sans 3. The interim mark stays until the owner picks one
of the logo concepts in `docs/brand/logo-concepts.md`.

### Done

- **Product:**
  - Public directory and job pages.
  - Reviewer and administrator dashboard.
  - Invite-only employer dashboard.
  - Invitations and password-reset links.
  - Reports.
  - Full vacancy lifecycle with reviewed revisions.
  - Expiry cron, closure, suspension, audit history, CSV export.
- **Security:**
  - Server-side permission checks in every service.
  - Nonce CSP and other security headers.
  - Cross-site posts rejected; HTTP redirected to HTTPS.
  - Restricted database role with append-only history tables.
  - bcrypt in PostgreSQL; fresh sessions on every request.
- **Tests:**
  - 69 Vitest unit and integration tests, including the restricted-role tests.
  - 43 Playwright end-to-end tests on the production build (desktop and
    mobile), with axe WCAG 2.1 AA scans on public and dashboard pages.
  - All pass locally. CI will run them on GitHub.
- **Visual review:**
  - Done with Playwright MCP at 360, 768 and 1440 px across public pages, the
    reviewer dashboard and the employer dashboard.
  - Fixes from the review: filters collapsed on small screens, closed-job
    wording, peso formatting in diffs, error-summary labels, employer
    required on the first submit, plain empty state with no listings.
  - The branding session also ran axe and overflow checks on 24 pages.
- **Ops:**
  - CI workflow, MIT licence, administrator invitation script, encrypted
    backup and restore scripts and drills.
  - README with screenshots, CONTRIBUTING, SECURITY, architecture,
    operations and design-system docs.

### Production verification (2026-10-24)

| Check               | Result                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTPS / certificate | Valid (Google Trust Services); HTTP → 301 HTTPS; HSTS sent                                                                                                             |
| Security headers    | CSP with per-response nonce, `X-Frame-Options: DENY`, `nosniff`, referrer policy                                                                                       |
| Database            | `/healthz` → `{"ok":true,"database":"ok"}` through Hyperdrive with the restricted role                                                                                 |
| Authentication      | Temporary QA admin accepted an invitation and signed in; sign-out ends the session                                                                                     |
| Single-use links    | Reused invitation shows "This invitation can't be used"                                                                                                                |
| Permissions         | Admin: `/manage`, `/manage/users` 200, `/employer` 403. Reviewer: `/manage` 200, `/manage/users` and `/manage/settings` 403. Signed out: `/manage` → sign-in           |
| Revocation          | Suspending the QA reviewer redirected its next request to sign-in; its sign-in was refused (401)                                                                       |
| Cross-site posts    | 403                                                                                                                                                                    |
| Cron                | `7 * * * *` registered on `trabaho-binan` (verified via API); expiry exercised locally through the Worker's scheduled handler                                          |
| Brand preview       | `/brand-preview` → 404 in production                                                                                                                                   |
| Data hygiene        | Both QA accounts deleted afterwards; their audit entries remain. Database marked `environment = production`, so the seed script refuses it (verified on a marked copy) |

The first administrator invitation (for the owner) was created with
`npm run admin:invite` and saved to the owner's local `.secrets/` directory.

### Remaining / owner actions

1. Accept the administrator invitation (`.secrets/admin-invite-*.txt`, single
   use, expires 7 days after 2026-10-24) and set a password.
2. Move `.secrets/backups/*` and `.secrets/backup-passphrase` to storage the
   owner controls (separately). Schedule weekly backups.
3. Decide on Workers Paid (see CPU findings) before wider promotion.
4. Choose a logo concept; confirm branding, support ownership and costs with
   PESO (plan §11). Don't claim an official partnership until confirmed.
5. Before using real data: name a PESO reviewer and backup; agree the
   verification checklist and listing policy.
6. Enable GitHub private vulnerability reporting (SECURITY.md relies on it).
7. Maintenance note: before upgrading `pg` to v9, switch the per-request
   client to a one-connection `Pool`. Concurrent loaders share one client,
   and pg 9 removes client-side query queueing.

## Resources

| Resource                                                                | Identifier                         | Plan                        |
| ----------------------------------------------------------------------- | ---------------------------------- | --------------------------- |
| Neon project `trabaho-binan` (aws-ap-southeast-1, PG 18)                | `sweet-frost-27860793`             | Free (pre-existing, reused) |
| Neon branch `production` (default)                                      | `br-blue-fire-b3go6619`            | Free                        |
| Neon branch `staging` (synthetic data)                                  | `br-flat-heart-b3j4hm3v`           | Free                        |
| Hyperdrive `trabaho-binan-production` (caching disabled)                | `b572c139ba864a67817c7a527bf3a9d9` | Free                        |
| Hyperdrive `trabaho-binan-staging` (caching disabled)                   | `03f35acb820b4021a930c8e9f24d29f5` | Free                        |
| Worker `trabaho-binan` + custom domain `trabaho.bantaybinan.com` + cron | version `70261148…`                | Workers Free                |
| Worker `trabaho-binan-staging` (workers.dev)                            | —                                  | Workers Free                |

No paid plan or add-on was enabled. `bantaybinan.com` and `www` still route to
the unrelated `bantay-alerto` Worker; no zone settings were changed.

Credentials live only in Cloudflare (Hyperdrive, Worker secrets) and in the
developer's ignored `.secrets/` directory. Nothing secret is committed.

## Decisions

See also [architecture.md](architecture.md#decisions-log).

- **Password hashing in PostgreSQL** (pgcrypto bcrypt, cost 10), because of
  the Workers Free 10 ms CPU budget.
- **No transactional email:** invitation and reset links are shown once to staff.
- **Better Auth HTTP handler not mounted**; public sign-up disabled.
- **No session cookie cache:** suspensions and role changes apply immediately.
- **One cron trigger, production only** (account limit is 5; 2 used elsewhere).
- **Hyperdrive query caching disabled.**
- **One organization per employer account** in the first release.
- **All employer edits to live listings are reviewed**; staff corrections are audited.
- **Administrators include reviewer permissions** for the pilot.
- **No PESO/City affiliation claims.** The owner-supplied seal and PESO logo
  files in the repository root are not used or committed.
- **Wrangler environments:** the top level is local only; `env.staging` and
  `env.production` are explicit.
- **HTTP → HTTPS in the Worker:** zone-wide settings belong to the parent domain.
- **Licence:** MIT (owner decision).

## Workers CPU findings

Measured with `wrangler tail` (`cpuTime` per invocation) on staging with the
full UI, 2026-10-24. Warm-path comparison: the same build in Node.

| Route                         | Staging median | Staging minimum | Node warm median |
| ----------------------------- | -------------- | --------------- | ---------------- |
| Public page from edge cache   | 1 ms           | 1 ms            | —                |
| Uncached job page             | 30 ms          | 10 ms           | 3.5 ms           |
| Uncached directory search     | 51 ms          | 23 ms           | 4.8 ms           |
| Reviewer overview (`/manage`) | 52 ms          | 19 ms           | 4.6 ms           |
| Reviewer job workspace        | 69 ms          | 18 ms           | 5.7 ms           |
| Sign-in                       | 26 ms          | 18 ms           | —                |

All ~140 requests returned `outcome: ok` and no request was terminated. But
uncached server-rendered pages consistently exceed the Workers Free 10 ms
budget. The gap from Node is mostly cold, low-traffic instances paying JIT
compilation costs. Cloudflare documents tolerance for _occasional_
overruns, so steady overruns risk intermittent 1102 errors as traffic grows.

Mitigations in place:

- Public job and listing pages are edge-cached (1–3 ms on hits).
- The directory uses one query instead of two.
- Password hashing runs in the database.

**Acceptance criterion "fits the selected Worker CPU limits": not met on Free
for uncached and dashboard pages.**

Options for the owner:

- Launch the pilot on Free and watch Workers Observability for `exceededCpu`.
- Move to Workers Paid (US$5/month, 30 s CPU, 10 M requests/month).

**Not enabled without approval.**

## Restore drills

| Date       | Source                               | Target                                                         | Result                                                                                               |
| ---------- | ------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 2026-10-24 | Neon `staging` (synthetic)           | Empty `restore_drill` DB on the staging branch (dropped after) | Passed: checksum OK; users 4, organizations 5, jobs 15, audit events 49, migrations 2 match          |
| 2026-10-24 | Neon `production` (encrypted backup) | Empty `restore_drill` DB on the staging branch (dropped after) | Passed: checksum OK; users 0, organizations 0, jobs 0, audit events 6, migrations 2, settings intact |
