# Contributing

Thank you for helping. Trabaho Biñan is a pro bono project for PESO Biñan, so
changes should keep it simple, free to run and safe for the people who use it.

## Getting started

Follow _Local development_ in the [README](README.md). You need Node.js 22.18
or newer and a local PostgreSQL with the `pgcrypto` extension.

## Ground rules

- **Synthetic data only.** Never put real vacancies, employer details,
  applicant information, database exports or ID documents in the repository,
  issues, screenshots or test fixtures. Use `example.test` addresses and names
  marked "(Demo)".
- **No secrets.** Connection strings, tokens and passwords belong in `.env`,
  `.dev.vars` or `.secrets/`, which are all git-ignored.
- **No unofficial branding.** Do not add government seals, PESO or City logos,
  or wording that implies an official partnership.
- **Stay within free tiers.** Do not add paid services or dependencies that
  require them.
- **Server-side permissions.** Every new action must check permissions in its
  service function, not only in the UI.

## Workflow

1. Create a branch from `main`.
2. Make focused commits using
   [Conventional Commits](https://www.conventionalcommits.org/), for example
   `feat: add barangay filter` or `fix: keep paused jobs out of search`.
3. Run the checks:

   ```sh
   npm run lint
   npm run format:check
   npm run typecheck
   npm test            # needs TEST_DATABASE_URL
   npm run test:e2e    # needs E2E_DATABASE_URL and E2E_APP_DATABASE_URL
   npm run build
   ```

4. Open a pull request that says what changed, why, and how you tested it.
   Include screenshots at 360 px and 1440 px for interface changes.

## Interface guidelines

The design system is documented in
[docs/design-system.md](docs/design-system.md). In short:

- Write plain, specific English. Use Filipino where it helps, and validate
  wording with residents.
- Mobile first: no horizontal scrolling at 360 px, and touch targets of at
  least 44 px.
- Every control has a visible label and a visible keyboard focus. Do not use
  colour as the only signal.
- Handle loading, empty, error, success and permission-denied states.
- Pages must work without JavaScript wherever practical (plain forms and links).

## Database changes

Edit `app/db/schema.ts`, generate a migration with `npm run db:generate`,
review the SQL, and follow _Database migrations_ in
[docs/operations.md](docs/operations.md). Never edit a migration that has
already been applied to staging or production.
