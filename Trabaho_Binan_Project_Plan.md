# Trabaho Biñan — Project Plan

**Version:** 1.1  
**Date:** October 24, 2026  
**Project lead:** Anthony Hernandez  
**Status:** Proposed MVP and partnership plan; working name subject to approval.

## 1. Purpose

Create a mobile-friendly job portal where Biñan residents can discover current local vacancies and learn how to apply. PESO staff and invited employers will manage listings through a dashboard. Direct applications and applicant tracking will follow once the listing workflow is working reliably.

The initial product complements Facebook: PESO can share links to complete, searchable job pages through its existing channel.

## 2. Confirmed starting point and assumptions

- Anthony reports that PESO Biñan confirmed its current job-listing workflow is posting on Facebook.
- The intended collaboration is with PESO Biñan and local employers/recruiters. A formal partnership, staff commitments, and official branding permission have not yet been established.
- Earlier desk research found public PESO-branded web pages. Their existence does not establish the tools PESO actively uses. Ask about ownership and existing systems before deciding integration or replacement.
- The difficulties below are hypotheses to validate: finding older vacancies, identifying expired jobs, comparing qualifications, and maintaining accurate hiring information.
- Features, schedules, and pilot targets in this plan are proposals, not commitments from PESO.

## 3. Product goals

1. Help residents find relevant jobs without searching through a Facebook feed.
2. Give each vacancy a clear location, deadline, qualifications, and application method.
3. Let PESO keep listings accurate and remove expired or filled positions.
4. Allow verified employers to submit vacancies with PESO oversight.
5. Establish a maintainable foundation for later direct applications.

**Primary audience:** Jobseekers in Biñan, including first-time applicants, experienced workers, and residents without a résumé ready to upload.

**Geographic scope:** Default to jobs physically located in Biñan. If PESO wants nearby opportunities, label them clearly and offer a separate location filter. Employer office location and actual work location must be separate fields.

## 4. Delivery phases

| Phase | Scope | Release condition |
| --- | --- | --- |
| 1: Public directory | Public browsing, job details, PESO dashboard, review and expiry, external application instructions | PESO can maintain current vacancies |
| 2: Employer pilot | Invite-only employer accounts, company profiles, vacancy submission and edits | Named employer contacts and approval owner are ready |
| 3: Direct applications | Applicant profiles, résumé/structured application, employer inbox, status tracking | Employers commit to reviewing applications; data handling arrangements are agreed |

**First release:** Phase 1 plus a small Phase 2 pilot. No jobseeker account is required. Applications continue through approved employer links, email, or walk-in instructions.

## 5. First-release scope

### Public website

- Search by job title, company, or keyword.
- Filter by work location, employment type, experience, education, and direct employer versus agency.
- Display salary range and pay period when provided; show “Not disclosed” otherwise.
- Show current published vacancies only in search results.
- Provide individual job pages with shareable URLs and clear application instructions.
- Display publication date, deadline, and last-confirmed date.
- Include a report-listing action and PESO contact/help page.
- Preserve expired job URLs with a clear closed notice and disable the apply action.
- Support mobile screens, keyboard navigation, readable contrast, and lightweight pages.
- Present all essential information as text; posters may supplement it.

### PESO dashboard

- Create vacancies on behalf of employers.
- Review, approve, reject with a reason, or request corrections.
- Manage employer verification and account invitations.
- Publish, pause, close, archive, and renew listings.
- View listings approaching expiry or needing reconfirmation.
- Review reports and record action taken.
- Export agreed vacancy data as CSV.
- Record who changed or approved a listing and when.

### Employer pilot dashboard

- Accept an invitation and manage an approved company profile.
- Create and edit draft vacancies.
- Submit vacancies for review and view review feedback.
- See only the organization's own records.
- Close filled jobs immediately.
- Request renewal or submit material changes for review.

### Explicitly deferred

- Jobseeker accounts, saved jobs, résumé uploads, and direct applications.
- AI matching, résumé ranking, chat, SMS, native mobile apps, and paid listings.
- Public résumé searches, bulk applicant exports, and overseas recruitment.
- Automatic Facebook ingestion, automatic Facebook publishing, and assumed integrations with existing systems.

## 6. Roles and access

| Role | Permissions |
| --- | --- |
| Visitor | Browse, filter, share, follow application instructions, report a listing |
| Employer member | Manage own organization's drafts and vacancies; submit changes; close own jobs |
| PESO reviewer | Review employers and jobs, publish listings, handle reports, access agreed operational reports |
| Platform administrator | Manage technical configuration, invitations, permissions, and system health |

Enforce permissions on the server for every action. Technical administration should not automatically grant access to future applicant documents. Employer verification is distinct from vacancy approval. Display verification labels only after an authorized reviewer completes the agreed process; verification does not guarantee a job offer.

## 7. Core workflows

### Publish a vacancy

1. PESO creates a vacancy or an invited employer submits one.
2. Required fields and application destination are validated.
3. A PESO reviewer checks the employer, job information, and instructions.
4. Reviewer approves publication or requests changes with a reason.
5. The system creates a public job page.
6. PESO manually shares the link on Facebook.
7. The employer/PESO closes the vacancy when filled, or the system expires it at the deadline.

### Listing lifecycle

`Draft → Pending review → Published → Closed or Expired`

`Pending review → Changes requested → Draft → Pending review`

Proposed defaults:

- A vacancy must have an explicit expiry date; propose 30 days where the employer has no earlier deadline.
- Store timestamps consistently and show deadlines in Philippine time.
- Send a reminder before expiry; renew only after someone confirms the opening remains available.
- Employer edits to title, compensation, location, requirements, or application destination require another review. Keep the approved version live until a revision is approved, unless the job is paused or closed.
- PESO can pause a reported listing immediately while investigating.
- Reopening a closed or expired job requires fresh confirmation and review.

### Apply during the first release

1. Resident opens a published vacancy.
2. Resident reviews qualifications, work location, deadline, and requirements.
3. Resident follows the stated external form, email, or walk-in instructions.
4. The portal records an apply-link click where appropriate.

An apply-link click is not a completed application. Do not report application, interview, or hiring counts unless independently recorded and confirmed.

## 8. Required vacancy information

| Field | Rule |
| --- | --- |
| Job title | One role per listing where practical |
| Employer | Linked organization record |
| Employer type | Direct employer or recruitment agency |
| Work location | City, barangay/address where appropriate, and work setup |
| Employment type | Full-time, part-time, contract, internship, or other agreed category |
| Description | Responsibilities in readable text |
| Qualifications | Education, skills, and experience; flag criteria requiring policy review |
| Salary | Optional range, currency, and pay period; never invent a value |
| Number of openings | Optional positive count |
| Application method | Approved HTTPS URL, company application email, or walk-in instructions |
| Deadline | Required; used for automatic expiry |
| Source and contact | Internal source reference and responsible employer/PESO contact |
| Confirmation | Last confirmed date and person responsible |

For agencies, distinguish the agency from the hiring workplace where disclosure is available. Do not imply the agency office is the job location.

## 9. Pages and navigation

| Area | Pages |
| --- | --- |
| Public | Jobs/home, job details, approved employer profile, about/help, report listing, privacy information |
| Employer | Login, company profile, my jobs, create/edit job, review feedback |
| PESO | Overview, review queue, all jobs, employer verification, reports, exports |
| Administration | User access, audit history, configuration |

The homepage should prioritize search and current jobs. Use plain English and familiar Filipino labels where helpful; validate language preferences with residents. Avoid making registration a barrier to browsing.

## 10. Technical approach

**Selected direction:** One full-stack TypeScript application on Cloudflare Workers, using Neon PostgreSQL from day one. This is a pro bono project: target $0/month for the pilot within provider limits. Confirm PESO hosting requirements before production deployment.

| Layer | Selection | Purpose |
| --- | --- | --- |
| Language | TypeScript | Shared types and validation |
| Framework | React Router, framework mode | Public pages, dashboards, loaders and actions |
| Hosting/backend | Cloudflare Workers Free | Application and backend execution |
| UI | Tailwind CSS + shadcn/ui | Forms, filters, tables and reusable components |
| Database | Neon PostgreSQL Free | Organizations, jobs, reviews, sessions and audit history |
| Database region | AWS Singapore | Initial regional choice, subject to PESO requirements |
| Connectivity | Cloudflare Hyperdrive Free | PostgreSQL connection pooling for Workers |
| ORM/migrations | Drizzle ORM, PostgreSQL dialect | Typed queries and versioned migrations |
| Authentication | Better Auth | Staff/employer authentication; prototype in Workers early |
| Scheduled tasks | Workers Cron Triggers | Expiry and batched reminders |
| File storage, deferred | Cloudflare R2 | Private uploads when direct applications are introduced |
| Testing | Vitest + Playwright | Business rules, permissions and critical journeys |

Use a supported PostgreSQL driver such as node-postgres with Hyperdrive. Configure Hyperdrive against Neon's direct endpoint rather than layering its pool over Neon's pooled endpoint. Keep database credentials server-side and use separate runtime and migration credentials. Disable Hyperdrive query caching initially so permissions, sessions, approvals, and closures are read fresh; optimize public listing caching separately.

D1 is not part of the selected stack. Starting with PostgreSQL avoids a later SQLite-to-PostgreSQL migration. PostgreSQL hosting can still be moved later, but data transfer, extensions, configuration, validation and cutover require planning.

### Repository setup

- Repository: `trabaho-binan`
- Title: **Trabaho Biñan — Local Job Portal**
- Description: A community job portal for Biñan City, helping residents discover local opportunities and enabling employers and PESO staff to manage verified job listings and recruitment workflows.
- Private initially; include README and Node `.gitignore`. Decide ownership and licensing before public release.
- Store this plan as `docs/project-plan.md` when the repository is created. No repository has been created by this planning update.

| Directory | Contents |
| --- | --- |
| `app/routes/` | Public pages and employer/PESO dashboards |
| `app/components/` | Shared interface components |
| `app/services/` | Publishing, verification and authorization rules |
| `app/db/` | PostgreSQL schema and queries |
| `app/lib/` | Authentication, validation and utilities |
| `workers/` | Worker entry point and scheduled handlers |
| `drizzle/` | Versioned SQL migrations |
| `tests/` | Permission and workflow tests |
| `docs/` | Plan, architecture decisions and operations guide |

### Free-tier budget and constraints

Provider limits below were checked on October 24, 2026. Recheck before launch; free plans can change. These are quotas, not projected usage or availability guarantees.

| Service | Current free allowance relevant to the pilot | Planning implication |
| --- | --- | --- |
| Workers | 100,000 requests/day; 10 ms CPU per invocation | Measure rendering and authentication CPU before committing to the deployment approach |
| Hyperdrive | 100,000 database queries/day | Count database statements, not just page visits; exceeding this daily quota causes operations to fail |
| Neon | 1 GB storage and 100 compute-unit hours/month per project | Monitor compute and storage; compute-unit hours are capacity-weighted, not simply wall-clock hours |
| Neon idle compute | Scales to zero after five minutes of inactivity | Expect wake-up latency; avoid frequent polling/keep-alives that defeat idle savings |
| Neon free restore history | Up to six hours or 1 GB of changes | Maintain independent encrypted exports and verify restore; short provider history is insufficient as the only recovery plan |

Budget rules:

- Target $0 recurring infrastructure cost during the pilot, not “free forever.”
- Keep the account on free plans; do not enable paid services without an agreed payer and budget.
- Begin with a provided hosting subdomain or an authorized existing PESO domain. A new custom domain is a separate expense.
- Defer R2, résumé uploads, SMS and other paid add-ons. A free allowance on a metered service is not a hard spending cap.
- Transactional email provider and free allowance remain to be selected and verified. Domain verification may introduce a cost. Use dashboard notices and manually delivered single-use invitations through existing approved channels if necessary during the pilot.
- Use indexed, paginated queries and batch reminders. Avoid polling and unnecessary database writes for analytics.
- Cache only public listing content briefly; purge affected pages when jobs close or approvals change, and never cache authenticated responses publicly. Cache lifetimes must not extend past job deadlines.
- Use synthetic data in development/staging. Keep production isolated; account for test environments in all usage estimates.
- Review usage weekly, and configure available alerts. Treat 70% of a quota as an internal investigation threshold, not a provider feature or hard cap.
- If limits are approached, first optimize queries/caching and reduce nonessential work. Discuss a funded upgrade only after measuring the bottleneck; do not silently upgrade.
- Benchmark Worker CPU for public rendering, sign-in, sessions and moderation. Avoid CPU-heavy password hashing inside the free Worker; validate an OAuth-based sign-in flow with pilot users. If any critical route cannot meet limits, adjust architecture or secure a small explicit hosting budget before launch.

### Architecture

Suggested architecture:

- Responsive web frontend with indexable public job pages.
- Backend for authentication, organization permissions, review actions, and public job queries.
- Relational database for users, companies, vacancies, revisions, and audit history.
- Scheduled task for expiry and reminders; public queries must also enforce deadlines if a scheduled task fails.
- Notification adapter for invitations and review updates; launch with dashboard notices and the verified free email option or manual invitation delivery described above.
- Basic monitoring, error logging, database backups, and a documented restore procedure.
- Separate development/staging and production environments; use synthetic data in staging.

Start with database search and ordinary filters. Avoid microservices and a dedicated search cluster for the pilot. Never assume access to a Facebook, PESO, or PhilJobNet API.

### Initial data model

| Entity | Purpose |
| --- | --- |
| User | Staff/employer account and account status |
| Organization | Employer/agency identity and verification status |
| OrganizationMembership | Links users to organizations and permissions |
| Job | Public identifier, organization, approved content, lifecycle and dates |
| JobRevision | Proposed changes and review decision |
| ModerationAction | Review reason, reviewer, timestamp |
| ListingReport | Reported issue and resolution |
| AuditEvent | Trace of sensitive management actions |
| JobMetric | Aggregated views and apply-link clicks |

## 11. Operations and partnership responsibilities

| Responsibility | Proposed owner |
| --- | --- |
| Product and development | Anthony |
| Vacancy approval and employer verification | Named PESO staff member and backup |
| Accuracy and closure of openings | Employer contact, with PESO follow-up |
| Hosting, domain, and service bills | Agree before public launch |
| Technical maintenance and incident handling | Anthony initially; agree support period and handover |
| Recruitment questions and listing reports | PESO operational contact |
| Data handling and future applicant requests | Designated owner agreed with PESO |

Before public launch, agree on branding, domain ownership, source-code ownership/licensing, operating costs, support hours, staff access, backups, and what happens if the pilot ends. Do not advertise an official city/PESO partnership until authorized.

Keep resident browsing free. Do not introduce applicant fees. Decide long-term funding separately from the pilot, such as an agreed maintenance arrangement or approved sponsorship.

## 12. Data protection and trust design

- First release does not collect résumés or applicant profiles.
- Collect only the staff/employer account details necessary to operate the portal.
- Keep verification documents private if the agreed process requires them.
- Validate application links and contacts during moderation; allow users to report suspicious content.
- Sanitize job text, rate-limit forms, and protect staff sessions.
- Agree retention, deletion, access, and incident procedures before collecting applicant data in Phase 3.
- For future résumés, use private storage, authorized access, file validation, and time-limited download links.
- Have the responsible PESO/data protection contact review the proposed data handling before Phase 3. This plan is a product design proposal, not a legal compliance determination.

## 13. Implementation milestones

Indicative schedule for one developer: 6–8 weeks for the directory and employer pilot, dependent on available hours, partner responses, and scope. Direct applications require a separate estimate.

| Milestone | Indicative window | Deliverable |
| --- | --- | --- |
| Discovery and ownership | Week 1 | Agreed scope, staff owner, sample vacancies, existing-system assessment |
| Prototype and content model | Week 2 | Mobile prototype, reviewed job form, deployed authentication/database spike and Worker CPU measurement |
| Directory and PESO tools | Weeks 3–4 | Search, details, moderation, expiry, sharing |
| Employer pilot tools | Week 5 | Invitations, organization permissions, drafts and review feedback |
| Quality and onboarding | Week 6 | Verified pilot listings, access testing, staff guide, backup check |
| Pilot adjustments/buffer | Weeks 7–8 | Fixes from real use and launch-readiness decision |

Use synthetic sample jobs in prototypes. Obtain approved vacancy information before publishing real listings.

## 14. Pilot plan and measures

Proposed recruitment targets: 5–10 employers, 30–50 genuine current vacancies if available, and 100–200 invited jobseekers over a four-week live pilot. These are planning targets, not expected results or prerequisites for shipping.

Recruit participants through PESO, employer channels, barangays, and local schools where relationships exist. Never add stale jobs just to reach a target count.

Measure:

- Percentage of published listings with complete required information: target 100%.
- Expired listings appearing as active: target zero.
- Listing accuracy in a weekly sample confirmed with employers.
- Median time from submission to PESO review.
- Job-detail visits and external apply-link clicks, reported separately.
- Whether residents can find a suitable vacancy and explain the application steps without assistance.
- PESO time spent maintaining listings and handling repetitive questions.
- Employer willingness to continue posting and reviewing applications in a later phase.

At the end of the pilot, choose to improve the directory, expand employer access, add direct applications, or pause if there is no sustainable operational owner.

## 15. Launch acceptance criteria

- [ ] Residents can browse and filter without an account on a small mobile screen.
- [ ] Every published job has complete requirements, a deadline, and usable application instructions.
- [ ] Unapproved jobs and unpublished revisions are not publicly accessible.
- [ ] Employer A cannot read or modify Employer B's private records, including through direct API requests.
- [ ] Employers cannot publish themselves or assign their own verification badge.
- [ ] Closed and expired jobs disable application actions and disappear from active search.
- [ ] Core workflows work with keyboard navigation and readable text.
- [ ] Reported listings can be paused and investigated.
- [ ] Approval, edits, and closure actions have an audit trail.
- [ ] Staff invitations, password recovery, and permission revocation work.
- [ ] Backup restoration has been exercised in a nonproduction environment.
- [ ] A PESO owner and backup can publish, correct, and close a job without developer assistance.
- [ ] Branding, support ownership, and operating expenses are agreed.
- [ ] Public rendering, sign-in, session checks and moderation fit the selected Worker CPU limits under representative load.
- [ ] Database migrations run successfully in staging before production.
- [ ] Neon storage/compute and Workers/Hyperdrive usage have been measured against free quotas.
- [ ] Authenticated responses bypass public caches; closing a job invalidates its cached public pages.
- [ ] Notification delivery and invitation/account recovery work within the selected budget.
- [ ] An independent encrypted database export can be restored without relying only on Neon's short free restore window.
- [ ] No paid subscriptions or automatic paid upgrades are enabled without an agreed payer.

## 16. Phase 3: Direct applications

Proceed only when participating employers commit to checking applications and updating outcomes, and data responsibilities are agreed.

Add:

- Jobseeker account and minimal reusable profile.
- Résumé upload or structured work-history application.
- Clear disclosure of the recipient before submission.
- Employer inbox restricted to applications for its own jobs.
- Applicant-visible status history and withdrawal option.
- Statuses: submitted, reviewed, shortlisted, interview, hired, not selected, withdrawn.
- Notifications and agreed response expectations.
- Explicit handling of applications when a job closes; closure must not silently delete pending applications.
- Retention and deletion controls, private files, and access auditing.

Do not expose a general database of residents to all recruiters. Record confirmed hires separately from self-reported outcomes, and label each appropriately.

## 17. Immediate next actions

1. Identify the PESO decision-maker, day-to-day reviewer, and backup.
2. Request 10–15 representative job postings and walk through how each is currently received, checked, published, and closed.
3. Ask about existing websites/tools, ownership, and any planned upgrades.
4. Interview 3–5 employers and 5–10 residents about their current process.
5. Confirm location coverage, verification rules, expiry policy, and application methods.
6. Build a clickable prototype of job search, job details, and the vacancy approval form.
7. Review the prototype with PESO; finalize the first-release backlog and operational responsibilities.
8. Create the private `trabaho-binan` repository and add the plan, README, and environment configuration examples without secrets.
9. Set up separate production and nonproduction data on Neon Free, choose Singapore, and connect Cloudflare Workers through Hyperdrive.
10. Deploy a small end-to-end spike: sign-in, organization authorization, vacancy read/write, and CPU/usage measurement before building the full dashboard.

## 18. Background references

These links informed the initial discussion; they do not prove active internal workflows or integrations. Anthony's report of PESO's confirmation is the working basis for the current Facebook posting process.

- PESO Biñan public website: https://www.pesobinan.com/index
- Biñan City 2025 Citizen's Charter: https://www.binan.gov.ph/wp-content/uploads/2025/02/2025-Citizens-Charter-10th-Edition.pdf
- DOLE Bureau of Local Employment, About PhilJobNet: https://ble.dole.gov.ph/about-philjobnet/
- PhilJobNet: https://philjobnet.gov.ph/

**First-release decision:** Build a searchable public job directory with PESO moderation and invite-only employer posting. Keep application instructions external until the pilot establishes a reliable recruitment workflow.


### Technical and pricing references for version 1.1

- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Neon pricing and free allowances: https://neon.com/pricing
- Neon regions: https://neon.com/docs/introduction/regions
- Cloudflare Hyperdrive with Neon: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/
- Cloudflare full-stack framework support: https://developers.cloudflare.com/workers/static-assets/routing/full-stack-application/

### Change log

- **1.1 — October 24, 2026:** Selected Cloudflare Workers + Neon PostgreSQL + Hyperdrive + Drizzle; added repository details, pro bono $0 pilot target, verified free-tier quotas, operational cost controls, and early runtime validation. R2 and direct applications remain deferred.
- **1.0 — October 24, 2026:** Initial product, partnership and phased delivery plan.
