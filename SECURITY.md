# Security policy

Trabaho Biñan stores staff and employer accounts, unpublished vacancies and
public reports. Please help keep it safe.

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
**Report a vulnerability** button under the repository's _Security_ tab.
This keeps the report private between you and the maintainers.

Include what you found, how to reproduce it, and the impact you expect. We aim
to acknowledge reports within 7 days. This is a volunteer-run, pro bono
project, so fix times vary with severity.

Please do not access other people's data, degrade the service, or use social
engineering while testing. Test against a local copy (see the README) rather
than the live site.

## Scope

In scope: the application code in this repository, and the live deployment at
trabaho.bantaybinan.com.

Out of scope: denial-of-service, findings that need a compromised device or
account, missing headers with no demonstrated impact, and third-party sites
that listings link to. Report scam job listings with the _Report a problem_
link on the job page instead.

## Security design (summary)

- Permissions are enforced on the server for every action. Employers can only
  reach their own organization's records.
- Accounts are invitation-only. There is no public sign-up.
- Passwords are hashed with bcrypt. Sessions are read fresh on every request,
  so suspension takes effect immediately.
- A nonce-based Content Security Policy is used. Cross-site form posts are
  rejected. Job text is rendered as plain text, never as HTML.
- The application's database role cannot change the schema or alter audit
  history.
- Secrets live in Cloudflare and Neon, never in this repository.

See [docs/architecture.md](docs/architecture.md) for details.
