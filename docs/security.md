# How Trabaho Biñan is secured

Trabaho Biñan is the job portal of PESO Biñan. This document explains how it
protects the people who use it: jobseekers, employers, and PESO staff. It is
written for anyone deciding whether to trust the site, including City and PESO
staff, IT reviewers, contributors and security researchers. The code is open
source, so every control described here can be checked in this repository.

To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## What we protect

| Data                               | Who can see it                              | Kept for                                                                  |
| ---------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| Published job listings             | Everyone                                    | Until archived                                                            |
| Unpublished listings and revisions | The employer's own staff and PESO reviewers | Until archived                                                            |
| Applications (name, mobile, files) | The hiring employer and PESO staff only     | 180 days, then deleted automatically                                      |
| Listing reports                    | PESO staff                                  | Kept; the reporter's contact details are erased when the report is closed |
| Staff and employer accounts        | The person, and administrators              | While the account is needed                                               |
| Audit history                      | Administrators                              | Permanently (it cannot be edited or deleted)                              |

The main risks for a public job board are scams (fake listings or fees),
misuse of applicants' personal data, account takeover, and someone using the
site's good name to mislead people. Most controls below exist for one of these.

## 1. Nothing goes public without review

- **Listings** from employers are checked by a PESO reviewer before they are
  published. Changes to a live listing go through a reviewed revision; the
  approved version stays live until the change is approved.
- **Employer profiles** (the "About the employer" text, website, email and
  phone shown on every job page) are reviewed the same way. An employer's
  edits wait as a proposal; staff see a field-by-field comparison.
- **Wording checks** flag text that needs a closer look, such as fees, age,
  gender or appearance requirements (Republic Act No. 10911 forbids age
  limits; applicants must never be charged).
- **Reviewers approve exactly what they saw.** Every approval carries the
  version the reviewer looked at; if the employer changed it in the meantime,
  the approval is refused and the reviewer must look again.
- **Anyone can report a listing.** Staff can pause a listing immediately; a
  paused listing's public page then shows only its title and a notice, so a
  suspicious listing stops spreading its instructions at once.
- **Suspending an employer** takes all its listings down, ends its people's
  sessions, cancels its unused invitations, and blocks sign-in and access to
  applicants until a reviewer lifts the suspension.

## 2. Accounts and sign-in

- **Invitation only.** There is no public sign-up. Administrators invite
  staff; staff invite employers into an existing organization. Reviewers can
  invite and manage employer accounts only; staff accounts belong to
  administrators. Nobody can change their own access.
- **Invitation and password-reset links** are 256-bit random tokens. Only a
  SHA-256 hash is stored. Invitations expire after 7 days, reset links after
  24 hours, and each works once (redeemed under a row lock, so two attempts
  cannot both succeed). Issuing a new link cancels the old one; links created
  by an administrator who is later suspended or demoted stop working.
- **Passwords** need at least 10 characters and are hashed with bcrypt inside
  PostgreSQL. Common passwords and the site's own names ("Trabaho2026!",
  "pesobinan123") are refused, as are passwords containing the email name.
- **Sign-in is rate-limited** per connection (IPv6 counted per /64 network) and
  per account. After 10 failed attempts in 15 minutes an account pauses for
  the rest of that window, wherever the attempts come from. Unknown email,
  wrong password and suspended account all give the same message.
- **Sign-ins are recorded** in the audit history with an approximate network
  (IPv4 /24, IPv6 /48) and country, never a full address.
- **Sessions** are stored in the database and re-checked on every request, so
  suspension or a role change takes effect on the next click. Cookies are
  `HttpOnly`, `Secure`, `SameSite=Lax` and use the `__Secure-` prefix. A
  session lasts seven days from sign-in. Changing a password ends other
  sessions and cancels unused reset links.
- **After signing in**, the site only redirects to its own pages; addresses
  that browsers could turn into another site (`//`, backslashes, tabs) are
  refused.

## 3. Who can see what

Permissions are enforced on the server, in the service layer, for every read
and write. Hiding a button is never the protection.

| Action                                | Jobseeker                  | Employer                | Reviewer | Admin |
| ------------------------------------- | -------------------------- | ----------------------- | -------- | ----- |
| Browse and apply                      | Yes                        | Yes                     | Yes      | Yes   |
| Draft and submit listings             |                            | Own organization        | Yes      | Yes   |
| Publish, pause, close any listing     |                            | Close own only          | Yes      | Yes   |
| See applications                      | Own, via reference + phone | Own organization's jobs | All      | All   |
| Delete an application                 |                            |                         | Yes      | Yes   |
| Verify or suspend employers           |                            |                         | Yes      | Yes   |
| Manage staff, settings, audit history |                            |                         |          | Yes   |

- An employer asking for another organization's job, application or file
  gets "not found", the same as for something that does not exist.
- Forms accept only the fields a role may change; extra fields in a crafted
  request are ignored (an employer cannot set its own verification status).
- Ids from addresses and forms are checked before they reach a query.
- The administrator dashboards are excluded from search engines and marked
  `noindex`.

## 4. Applicants' personal data

- **Minimal collection.** Applying needs only a name and a Philippine mobile
  number; email, work history, message and files are optional. No account,
  no tracking cookies, no advertising.
- **Files** (up to three: PDF, Word `.docx`, JPG or PNG; 5 MB each, 10 MB in
  all) are checked by their contents, not their names. Old `.doc` files are
  refused because they can carry macros.
- **Photos lose their metadata.** The browser shrinks photos before upload;
  the server then rebuilds each JPEG from only what is needed to display it,
  dropping GPS location, camera details, comments, embedded extra images and
  motion-photo video. Only the rotation flag is kept. PNG text, time and EXIF
  chunks are removed.
- **Files are private.** They are stored in a private Cloudflare R2 bucket
  with no public address, and served only after a permission check, with
  headers that stop browsers from caching them, guessing their type or
  running anything in them. Photos can be viewed in the browser; documents
  always download. Every view and download is recorded (by file number, not
  file name).
- **Status checks** need both the reference (TB-XXXXXX) and the mobile number
  or email used to apply. A wrong pair reveals nothing, the answer never
  includes contact details, and lookups are rate-limited.
- **Deletion.** Applications and their files are deleted automatically 180
  days after they are sent; an R2 lifecycle rule deletes stored files after
  190 days as a backstop. Staff can delete an application earlier (spam, or
  the applicant asks) with a recorded reason. Encrypted backups are kept for
  at most eight weeks.
- **Applications are rate-limited** per connection (generous, because job
  fairs and offices share one) and per mobile number.

## 5. Web protections

- **HTTPS only**, with HSTS (one year). Plain HTTP is redirected.
- **Content Security Policy** with a fresh random nonce on every response:
  only the site's own scripts run; no plugins, no framing (`frame-ancestors
'none'`), forms post only to the site.
- **Other headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options:
DENY`, `Cross-Origin-Opener-Policy: same-origin`, a strict referrer policy
  (`no-referrer` on pages whose address holds a token), and a
  `Permissions-Policy` that turns off camera, microphone, location and
  payments.
- **Cross-site form posts are rejected** using the browser's `Sec-Fetch-Site`
  and `Origin` headers.
- **Request size limits** are enforced before a request is read: 11 MB for
  applications, 256 KB for every other form.
- **Text is never rendered as HTML.** Listings, profiles and messages are
  shown as plain text. Links in listings must be `https://`.
- **Caching:** only anonymous visits to public pages are cached at the edge,
  briefly. Pages for signed-in people, and anything personal, are marked
  `private, no-store`. Public pages with unknown query parameters redirect to
  their clean address, so tracking tags and random values cannot fill the
  cache or bypass it.
- **Staging** (sample data only) tells search engines not to index it.

## 6. Database

- The site connects with a **restricted database role**. It can read, add and
  change rows, but cannot change the schema, and can delete only sign-in
  sessions, sign-in tokens and applications. This is tested.
- The **audit history and job history are append-only** for the site: it can
  add entries but never edit or delete them, and because it cannot delete
  jobs or users, nothing can remove history by cascade either.
- Schema changes run separately, with owner credentials that the site never
  has. Staging and production use different passwords for every role.
- Errors are logged without query values, so passwords and applicants'
  details never reach the logs; account-link tokens are masked in logged
  addresses.

## 7. Infrastructure and secrets

- Hosted on **Cloudflare Workers** with a **Neon PostgreSQL** database in
  Singapore and **Cloudflare R2** storage in the Asia-Pacific region.
- **Secrets** (the session signing key, database credentials) live in
  Cloudflare and Neon, never in this repository. The repository's full history
  has been checked for committed secrets.
- **Production** answers only on its own domain; the default `workers.dev`
  address and preview URLs are turned off. Staging uses separate databases,
  storage, rate limits and credentials.
- **Backups** are encrypted before they are written to disk (no unencrypted
  copy is ever stored), checked with a checksum on restore, and rehearsed
  quarterly in a separate database.
- **Continuous integration** is set up to run every test on each change with
  a read-only token. Its actions are pinned to exact versions, and Dependabot proposes
  updates weekly.

## How this is tested

Every change runs:

- **Unit and integration tests** (123) against a real PostgreSQL database,
  including organization boundaries, review and revision rules, suspension,
  invitations and resets, approval versions, the restricted database role,
  photo metadata removal, safe logging, redirects and request limits.
- **End-to-end tests** (46) in real browsers on desktop and mobile sizes:
  applying with a GPS-tagged photo (and checking the stored copy has no
  location), the status check, employer and staff views, cross-organization
  access attempts, security headers and accessibility scans.

## Pre-launch security review (25 October 2026)

Four independent reviews covered sign-in and accounts, permissions, the public
pages and uploads, and infrastructure. No critical or high-severity issues were
found. These medium and low findings were fixed and deployed the same day:

| Finding                                                            | Fix                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| A suspended employer's staff could still read applicants' details  | Suspension ends sessions, cancels invitations and blocks access                   |
| Employer profile text reached every job page without review        | Profile changes wait for review                                                   |
| A reviewer could approve a version they had not seen               | Approvals carry and check the version seen                                        |
| A paused listing stayed fully readable                             | Paused pages show only the title and facts; pages send allow-listed fields only   |
| Failed database queries could log passwords or applicants' details | Log-safe error handling                                                           |
| The database role could delete rows and cascade into history       | Deletes limited to sessions, tokens and applications                              |
| Staging and production shared an owner password                    | Staging password reset                                                            |
| Large uploads were read before any size check                      | Size limits before reading                                                        |
| Sign-in limits were per address only                               | Per-account limits, /64 grouping, temporary pause, sign-in audit, password checks |
| A tab character could slip past the redirect check                 | Addresses resolved and checked properly                                           |
| Some photo metadata survived (after the image, between scans)      | Photos rebuilt from image data only                                               |
| Applicant file names were kept in the permanent audit history      | Files recorded by number                                                          |

## Known limitations and accepted risks

- **No two-factor sign-in yet.** Recommended for administrators before wider
  use.
- **Free-plan limits.** The site runs on free tiers. A large enough flood of
  requests can use up the daily request or database quota and take the site
  offline until the quota resets (08:00 Philippine time). A Cloudflare rate
  limiting rule on the zone, or a paid Workers plan, would remove this risk.
- **Reset links are powerful by design.** Administrators can issue reset links
  for any account and reviewers for employer accounts; whoever opens one can
  set the password. Every link is recorded in the audit history and works once.
- **Rate limits are approximate**: they are counted per Cloudflare location.
- **Uploaded PDF and Word files are not virus-scanned.** Employers and staff
  should open them with up-to-date software. Macro-capable `.doc` files are
  refused.
- **Automated checks on GitHub are paused** by a billing hold on the account.
  Until that is resolved, the full test suite is run locally before every
  deployment.
- **Cloudflare's request logs** may record invitation and reset addresses.
  Only the people who already control the hosting account can read them, and
  the links expire and work once.
