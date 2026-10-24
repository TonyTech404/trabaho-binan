# Operations guide

How to run, deploy, back up and look after Trabaho Biñan. Commands assume the
repository root, Node.js 22.18 or newer, and PostgreSQL 18 client tools
(`psql`, `pg_dump`, `pg_restore`) for work against Neon.

Connection strings and secrets never go in the repository. Keep them in a
password manager, or in the git-ignored `.secrets/` directory with mode `600`.

## Environments

| Environment       | Worker                                                        | Database                      | Data                          |
| ----------------- | ------------------------------------------------------------- | ----------------------------- | ----------------------------- |
| Local development | `npm run dev` (top-level wrangler config)                     | Local PostgreSQL              | Synthetic (`npm run db:seed`) |
| Tests             | Vitest and `vite preview`                                     | Disposable local/CI databases | Synthetic, rebuilt every run  |
| Staging           | `trabaho-binan-staging` on workers.dev (`env.staging`)        | Neon branch `staging`         | Synthetic only                |
| Production        | `trabaho-binan` at trabaho.bantaybinan.com (`env.production`) | Neon branch `production`      | Real                          |

Each database has two roles:

- **Owner** (`neondb_owner` on Neon): runs migrations, backups and admin scripts.
- **Runtime** (`trabaho_app`): used by the Worker through Hyperdrive. Row access
  only, no schema changes; `audit_events` and `job_events` are append-only.

## Free-tier budget

The pilot targets $0/month. These are quotas, not guarantees; recheck them
before launch and when providers change plans.

| Service       | Free allowance                               | Where to check                                           |
| ------------- | -------------------------------------------- | -------------------------------------------------------- |
| Workers       | 100,000 requests/day; 10 ms CPU per request  | Cloudflare dashboard → Workers → trabaho-binan → Metrics |
| Hyperdrive    | 100,000 queries/day                          | Cloudflare dashboard → Hyperdrive                        |
| Neon          | 100 CU-hours/month, 1 GB storage per project | Neon console → project → Usage                           |
| Workers Logs  | 200,000 events/day, 3-day retention          | Worker → Observability                                   |
| Cron Triggers | 5 per account (other projects use 2)         | Worker → Settings → Triggers                             |

Review usage weekly. Treat 70% of any quota as a signal to investigate, not as
a hard limit. Optimise queries and caching first; discuss a funded upgrade
only after measuring the bottleneck. **Never enable a paid plan without an
agreed payer.**

CPU time is the tightest limit. Cold Worker instances regularly use more than
10 ms on uncached pages; Cloudflare tolerates occasional overruns, but steady
overruns end in errors (1102 / `exceededCpu`). To check, run
`npx wrangler tail trabaho-binan --format json` while browsing and look at
`cpuTime` and `outcome`. Workers Paid (US$5/month, 30 s CPU) is the fallback,
and the owner must approve it.

## Local setup

```sh
npm ci
cp .env.example .env              # then edit the connection strings
cp .dev.vars.example .dev.vars    # then set BETTER_AUTH_SECRET (openssl rand -base64 48)
createdb trabaho_dev && createdb trabaho_test && createdb trabaho_e2e
npm run db:migrate                # uses DATABASE_URL
SEED_PASSWORD='choose-a-local-password' npm run db:seed
npm run dev
```

Optional but closer to production: create a local `trabaho_app` role, apply
`scripts/sql/grant-app-role.sql`, and point
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` at it.

## Database migrations

Migrations are versioned SQL files in `drizzle/`, generated from
`app/db/schema.ts`.

1. Change `app/db/schema.ts`, then run `npm run db:generate -- --name short_description`.
2. Read the generated SQL. Prefer additive changes. For anything that rewrites
   or drops data, write the migration by hand and plan a backfill.
3. Run `npm test`, which rebuilds the test database from every migration.
4. Apply to **staging** and check the staging site:
   `MIGRATION_DATABASE_URL="$STAGING_OWNER_URL" npm run db:migrate`
5. **Back up production** (see below), then apply:
   `MIGRATION_DATABASE_URL="$PRODUCTION_OWNER_URL" npm run db:migrate`
6. Re-apply runtime grants if new tables need special handling (the default
   privileges cover ordinary new tables):
   `psql "$PRODUCTION_OWNER_URL" -v app_role=trabaho_app -f scripts/sql/grant-app-role.sql`

Deploy code that depends on a migration only after the migration has been
applied. If a migration goes wrong, fix forward with a new migration, or
restore from the pre-migration backup or Neon's restore window (6 hours on
Free).

## Deploying

The Cloudflare Vite plugin builds for one environment at a time:

```sh
# Staging (workers.dev, synthetic data)
CLOUDFLARE_ENV=staging npm run build && npx wrangler deploy

# Production (trabaho.bantaybinan.com)
npm run lint && npm run typecheck && npm test
CLOUDFLARE_ENV=production npm run build && npx wrangler deploy
```

A brand-new Worker needs its secret on the first deploy:
`npx wrangler deploy --secrets-file path/to/file` (a file containing
`BETTER_AUTH_SECRET=...`). Later, rotate it with
`npx wrangler secret put BETTER_AUTH_SECRET --name trabaho-binan`.
Rotating the secret signs everyone out.

The production custom domain is created by the `custom_domain` route on the
first deploy. Do not add or edit DNS records for `bantaybinan.com` by hand.

After each production deploy, check:

- `https://trabaho.bantaybinan.com/healthz` returns `{"ok":true,"database":"ok"}`.
- The home page loads over HTTPS with a `content-security-policy` header.
- Signing in and out works for a staff account.
- `/manage` redirects to sign-in when signed out.
- The cron trigger is listed under the Worker's triggers.

Record the deployed commit in `docs/progress.md`.

## One-time production setup

1. Create the runtime role on the production branch (as the owner), using a
   long random password:
   `CREATE ROLE trabaho_app WITH LOGIN PASSWORD '…';`
2. Run migrations and the grant script (see above).
3. Create a Hyperdrive config with caching disabled, using the **direct**
   (non-pooled) Neon host and the runtime role:
   `npx wrangler hyperdrive create trabaho-binan-production --connection-string="postgresql://trabaho_app:…@ep-….ap-southeast-1.aws.neon.tech/neondb?sslmode=require" --caching-disabled`
   Put its id in `wrangler.jsonc` under `env.production`.
4. Deploy, then create the first administrator (next section).

## Administrator setup

Create the first administrator invitation from a trusted machine with owner
access. This also marks the database as production, so the seed script will
always refuse to run against it:

```sh
DATABASE_URL="$PRODUCTION_OWNER_URL" npm run admin:invite -- \
  --email admin@example.org \
  --base-url https://trabaho.bantaybinan.com \
  --mark-environment production
```

The link is written to `.secrets/admin-invite-*.txt`, not to the terminal.
Deliver it privately. It works once and expires after 7 days.

After that, everything is done in the dashboard:

- **Reviewers and administrators:** Users and access → Invite staff.
- **Employers:** Employers → add the organization → _Invite someone from this
  employer_. Reviewers can do this.
- **Password resets:** create a reset link from Users and access (any account),
  or from the employer's page (employer accounts). Resetting signs the
  person out everywhere.
- **Revoking access:** Suspend the account. Its sessions end immediately.
  _Sign out everywhere_ ends sessions without suspending.
- **Settings:** Settings → who runs the site (default "PESO Biñan") and the
  contact details shown on the help and privacy pages.

## Importing vacancies from public sources

`npm run jobs:import` loads researched vacancies from a JSON file in
`data/imports/` through the normal job services. Each record carries its
source URL, the date it was retrieved and the evidence it was checked against.

```sh
# Preview what would happen (no writes)
DATABASE_URL="$PRODUCTION_APP_URL" npm run jobs:import -- data/imports/<file>.json --dry-run
# Import (production needs --production)
DATABASE_URL="$PRODUCTION_APP_URL" npm run jobs:import -- data/imports/<file>.json --production
```

- A vacancy is **published** only when its source states a future closing date
  and its text raises no policy flags (age, gender, appearance and similar).
  Everything else goes to the **review queue** for a PESO reviewer to confirm
  with the employer first.
- `--publish-undated` also publishes vacancies whose source gives no closing
  date. They close 30 days after posting, and the description says so. Flagged
  vacancies still go to the review queue.
- The actions are recorded under "Listings import", a suspended staff account
  that cannot sign in, so the audit trail shows they were automated.
- Published imports are **not** marked as confirmed open, so they appear under
  "Needs reconfirmation" on the reviewer overview until someone checks with
  the employer. The footer and help page tell residents that these listings
  are copied from public announcements and not confirmed.
- The description ends with the source, and the application link opens the
  original announcement. Organizations it creates are **not verified**.
- Re-running a file skips vacancies already imported from the same source.
- Only use sources whose terms allow reuse: government notices and employers'
  own pages. Do not scrape JobStreet, Indeed, LinkedIn, Kalibrr or Facebook.
  Never import personal contact details.

## Backups and restoration

Neon Free keeps 6 hours (or 1 GB) of history. That is not enough on its own,
so take independent, encrypted exports.

**Take a backup** (weekly, and before every production migration):

```sh
BACKUP_DATABASE_URL="$PRODUCTION_OWNER_URL" \
BACKUP_PASSPHRASE_FILE=/secure/path/trabaho-backup-passphrase \
PG_DUMP=/path/to/pg18/pg_dump \
scripts/backup.sh /secure/backups/trabaho
```

- Output: `trabaho-binan-<UTC timestamp>.dump.gpg` plus a `.sha256` file.
- Use `BACKUP_GPG_RECIPIENT=<key id>` instead of a passphrase if the people
  who restore hold a GPG private key.
- Store backups outside this repository, on storage the project owner
  controls. Keep at least 4 weekly copies. Never upload them anywhere public,
  including CI artefacts of a public repository.
- Store the passphrase separately from the backups, in a password manager
  that a second trusted person can access.

**Restore** into an _empty_ database. The script refuses non-empty targets.

```sh
RESTORE_DATABASE_URL="$EMPTY_TARGET_DB_URL" \
BACKUP_PASSPHRASE_FILE=/secure/path/trabaho-backup-passphrase \
PG_RESTORE=/path/to/pg18/pg_restore PSQL=/path/to/pg18/psql \
scripts/restore.sh /secure/backups/trabaho/trabaho-binan-….dump.gpg
```

Then re-create the runtime role on the target if needed and apply
`scripts/sql/grant-app-role.sql`. To switch production to a restored database,
point the Hyperdrive config at it with `npx wrangler hyperdrive update <id>
--connection-string=…`.

**Restore drill (quarterly, in a non-production environment):** create an
empty database (for example `CREATE DATABASE restore_drill;` on the staging
branch), restore the latest backup into it, compare the row counts the script
prints with the source, then drop it. Record the date and result in
`docs/progress.md`.

## Applications and résumés

Jobs posted on the site can take applications with a résumé (tick _Accept
applications on Trabaho Biñan_ on the job form; it is on by default for new
jobs and off for imported listings).

- Résumés are stored in private R2 buckets: `trabaho-binan-resumes`
  (production) and `trabaho-binan-resumes-staging`. Public access (r2.dev and
  custom domains) is disabled; keep it that way. Locally, `npm run dev` uses a
  simulated bucket on disk.
- Only members of the job's organization and staff (reviewers, admins) can see
  an application. Résumés are streamed through `/applications/:id/resume`
  after a permission check, and every download is recorded in the audit
  history.
- Files are checked by their contents (PDF, DOCX or DOC only) and limited to
  5 MB. The form is rate-limited per connection.
- **Retention:** the hourly cron deletes applications and their résumés 180
  days after they were sent (`APPLICATION_RETENTION_DAYS`). Staging has no
  cron, so its applications are not purged automatically.
- **Deletion requests:** find the application by its reference (TB-…) in
  Applications, then delete the database row and the R2 object
  (`npx wrangler r2 object delete trabaho-binan-resumes/<resume_key>`). Record
  the request in your incident or request log.
- R2 Free covers 10 GB of storage and 1 million writes per month; résumés are
  small, but check usage monthly with the other quotas.

## Routine maintenance

Weekly:

- Review queue and open reports are empty or being handled.
- Overview → _Needs reconfirmation_: call employers whose listings are not confirmed open.
- Quotas (see the budget table) and Worker errors in Observability.
- Take a backup.

Monthly:

- Users and access: suspend accounts that are no longer needed.
- Audit history: spot-check approvals and verification changes.
- `npm outdated`; update dependencies on a branch, run all checks, deploy to
  staging first.

## Incident playbook

| Situation                             | First steps                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Listing may be a scam or charges fees | Pause it from Reports or the job page (immediate), contact the employer, then close or resume. Suspend the employer if needed. |
| Staff or employer account compromised | Suspend the account (ends sessions), check Audit history, issue a reset link to the verified owner, reactivate.                |
| Secret leaked (`BETTER_AUTH_SECRET`)  | `wrangler secret put` a new value (signs everyone out).                                                                        |
| Database password leaked              | Change the role password in Neon (`ALTER ROLE … PASSWORD`), update Hyperdrive with `wrangler hyperdrive update`.               |
| Bad data change                       | Use Neon's restore window (6 h) or restore the latest backup into a new database and compare.                                  |
| Site down or slow                     | Check `/healthz`, Workers Observability errors, Neon status and usage; quotas reset at 00:00 UTC (Workers, Hyperdrive).        |
