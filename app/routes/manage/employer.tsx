import { ArrowLeft, ExternalLink, Plus } from "lucide-react";
import { data, Form, Link, redirect } from "react-router";
import { ActionError, ActionForm } from "~/components/dashboard/job-panels";
import { JobTable } from "~/components/dashboard/job-table";
import { OneTimeLink } from "~/components/dashboard/link-result";
import { NoticeBanner } from "~/components/dashboard/notice";
import { OrganizationForm } from "~/components/dashboard/org-form";
import { PageHeader } from "~/components/dashboard/shell";
import { VerificationBadge } from "~/components/dashboard/status";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { getServices } from "~/lib/context.server";
import { label, ORGANIZATION_TYPES } from "~/lib/labels";
import { purgePublicPaths } from "~/lib/public-cache.server";
import { reasonFrom, serviceErrorResult, withNotice } from "~/lib/route-helpers.server";
import { requireStaffViewer } from "~/lib/session.server";
import { describeAge, formatDate } from "~/lib/time";
import { emailSchema, fieldErrors, formToObject, organizationInputSchema } from "~/lib/validation";
import {
  accountLinkUrl,
  createInvitation,
  createPasswordReset,
  listOpenLinks,
  revokeAccountLink,
} from "~/services/account-links.server";
import { listOrganizationJobsForStaff } from "~/services/job-queries.server";
import {
  getOrganizationForActor,
  listOrganizationMembers,
  setOrganizationVerification,
  updateOrganization,
} from "~/services/organizations.server";
import { setUserStatus } from "~/services/users.server";
import type { Route } from "./+types/employer";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.organization.name ?? "Employer"} — Review dashboard` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const viewer = await requireStaffViewer(request, context);
  const db = await getServices(context).db();
  try {
    const organization = await getOrganizationForActor(db, viewer, params.organizationId);
    const [members, jobs, links] = await Promise.all([
      listOrganizationMembers(db, viewer, organization.id),
      listOrganizationJobsForStaff(db, viewer, organization.id),
      listOpenLinks(db, viewer),
    ]);
    return {
      organization,
      members,
      jobs,
      invitations: links.filter(
        (l) => l.organizationId === organization.id && l.purpose === "invitation",
      ),
    };
  } catch (error) {
    throw serviceErrorResult(error);
  }
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const viewer = await requireStaffViewer(request, context);
  const services = getServices(context);
  const db = await services.db();
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const orgId = params.organizationId;
  const back = (notice: string) => redirect(withNotice(`/manage/employers/${orgId}`, notice));
  try {
    switch (intent) {
      case "save": {
        const raw = formToObject(form);
        const parsed = organizationInputSchema.safeParse(raw);
        if (!parsed.success)
          return data(
            { errors: fieldErrors(parsed.error), values: raw as Record<string, string> },
            { status: 400 },
          );
        const org = await updateOrganization(db, viewer, orgId, parsed.data);
        await purgePublicPaths(services.baseUrl, [`/employers/${org.slug}`]);
        return back("org_saved");
      }
      case "verify":
      case "unverify":
      case "suspend": {
        const note = reasonFrom(form);
        if (intent === "suspend" && !note)
          return data({ error: "Write why the employer is suspended." }, { status: 400 });
        const status =
          intent === "verify" ? "verified" : intent === "suspend" ? "suspended" : "unverified";
        const { organization, pausedJobs } = await setOrganizationVerification(
          db,
          viewer,
          orgId,
          status,
          note,
        );
        await purgePublicPaths(services.baseUrl, [
          "/",
          `/employers/${organization.slug}`,
          ...pausedJobs.flatMap((j) => [`/jobs/${j.publicId}`, `/jobs/${j.publicId}/${j.slug}`]),
        ]);
        return back(
          intent === "verify" ? "verified" : intent === "suspend" ? "suspended" : "unverified",
        );
      }
      case "invite": {
        const email = emailSchema.safeParse(form.get("email"));
        if (!email.success)
          return data({ inviteError: "Enter a valid email address." }, { status: 400 });
        const { link, token } = await createInvitation(db, viewer, {
          email: email.data,
          role: "employer",
          organizationId: orgId,
        });
        return {
          oneTimeLink: {
            url: accountLinkUrl(services.baseUrl, link, token),
            expiresAt: link.expiresAt,
            purpose: link.purpose,
            email: email.data,
          },
        };
      }
      case "reset_link": {
        const { link, token } = await createPasswordReset(
          db,
          viewer,
          String(form.get("userId") ?? ""),
        );
        return {
          oneTimeLink: {
            url: accountLinkUrl(services.baseUrl, link, token),
            expiresAt: link.expiresAt,
            purpose: link.purpose,
            email: link.email ?? "",
          },
        };
      }
      case "suspend_user":
      case "reactivate_user":
        await setUserStatus(
          db,
          viewer,
          String(form.get("userId") ?? ""),
          intent === "suspend_user" ? "suspended" : "active",
        );
        return back("user_updated");
      case "revoke_link":
        await revokeAccountLink(db, viewer, String(form.get("linkId") ?? ""));
        return back("link_revoked");
      default:
        return data({ error: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    return serviceErrorResult(error);
  }
}

export default function ManageEmployer({ loaderData, actionData }: Route.ComponentProps) {
  const { organization: org, members, jobs, invitations } = loaderData;
  const result = actionData as
    | {
        oneTimeLink?: {
          url: string;
          expiresAt: string | Date;
          purpose: "invitation" | "password_reset";
          email: string;
        };
        error?: string;
        inviteError?: string;
        errors?: Record<string, string>;
        values?: Record<string, string>;
      }
    | undefined;

  return (
    <>
      <PageHeader
        back={
          <Link to="/manage/employers" className="link inline-flex min-h-11 items-center gap-1.5">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Employers
          </Link>
        }
        title={org.name}
        description={
          <p className="flex flex-wrap items-center gap-2">
            {label(ORGANIZATION_TYPES, org.type)}
            <VerificationBadge status={org.verificationStatus} />
            {org.verifiedAt ? (
              <span className="text-sm">since {formatDate(org.verifiedAt)}</span>
            ) : null}
          </p>
        }
        actions={
          <>
            <Link
              to={`/employers/${org.slug}`}
              target="_blank"
              className={buttonVariants({ variant: "outline" })}
            >
              Public page
              <ExternalLink aria-hidden="true" />
            </Link>
            <Link to={`/manage/jobs/new?organization=${org.id}`} className={buttonVariants()}>
              <Plus aria-hidden="true" />
              Add a vacancy
            </Link>
          </>
        }
      />
      <NoticeBanner />
      <ActionError error={result?.error} />
      {result?.oneTimeLink ? <OneTimeLink {...result.oneTimeLink} /> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section
          aria-labelledby="verify-heading"
          className="rounded-lg border border-line bg-surface p-4"
        >
          <h2 id="verify-heading" className="text-xl font-bold">
            Verification
          </h2>
          <p className="mt-1 text-[0.9375rem] text-ink-muted">
            Mark as verified only after completing the agreed checks. Employers cannot verify
            themselves. Suspending pauses all of the employer's live listings at once.
          </p>
          <div className="mt-3 flex flex-wrap items-start gap-2">
            {org.verificationStatus !== "verified" && org.verificationStatus !== "suspended" ? (
              <ActionForm
                intent="verify"
                label="Mark as verified"
                variant="default"
                reasonLabel="Checks completed"
                reasonHint="For example: business permit sighted, called HR on the listed number."
                confirmLabel="Confirm verification"
              />
            ) : null}
            {org.verificationStatus === "verified" ? (
              <ActionForm
                intent="unverify"
                label="Remove verification"
                reasonLabel="Why?"
                confirmLabel="Remove verification"
              />
            ) : null}
            {org.verificationStatus === "suspended" ? (
              <ActionForm
                intent="unverify"
                label="Lift suspension"
                reasonLabel="Why?"
                confirmLabel="Lift suspension"
              />
            ) : null}
            {org.verificationStatus !== "suspended" ? (
              <ActionForm
                intent="suspend"
                label="Suspend employer"
                variant="destructive-outline"
                reasonLabel="Why is the employer suspended?"
                confirmLabel="Suspend and pause listings"
              />
            ) : null}
          </div>
        </section>

        <section
          aria-labelledby="accounts-heading"
          className="rounded-lg border border-line bg-surface p-4"
        >
          <h2 id="accounts-heading" className="text-xl font-bold">
            Employer accounts
          </h2>
          {members.length === 0 ? (
            <p className="mt-1 text-ink-muted">
              No accounts yet. Invite someone from this employer to submit their own vacancies.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {members.map((m) => (
                <li key={m.id} className="space-y-2 py-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.name}</span>
                    {m.status === "suspended" ? <Badge variant="danger">Suspended</Badge> : null}
                  </p>
                  <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">
                    {m.email}, last active {m.lastActiveAt ? describeAge(m.lastActiveAt) : "never"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <ActionForm
                      intent="reset_link"
                      label="Create password reset link"
                      hidden={{ userId: m.id }}
                    />
                    {m.status === "active" ? (
                      <ActionForm
                        intent="suspend_user"
                        label="Suspend account"
                        variant="destructive-outline"
                        hidden={{ userId: m.id }}
                      />
                    ) : (
                      <ActionForm
                        intent="reactivate_user"
                        label="Reactivate account"
                        hidden={{ userId: m.id }}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Form method="post" className="mt-4 space-y-2 border-t border-line pt-4">
            <input type="hidden" name="intent" value="invite" />
            <Label htmlFor="invite-email">Invite someone from this employer</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="invite-email"
                name="email"
                type="email"
                autoComplete="off"
                className="min-w-0 flex-1"
                aria-invalid={result?.inviteError ? true : undefined}
                aria-describedby={result?.inviteError ? "invite-error" : undefined}
              />
              <Button type="submit">Create invitation link</Button>
            </div>
            {result?.inviteError ? (
              <p id="invite-error" className="text-sm font-semibold text-danger">
                {result.inviteError}
              </p>
            ) : null}
          </Form>
          {invitations.length ? (
            <div className="mt-4">
              <h3 className="font-semibold">Unused invitations</h3>
              <ul className="mt-1 divide-y divide-line">
                {invitations.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-sm [overflow-wrap:anywhere]">
                      {l.email}, expires {formatDate(l.expiresAt)}
                    </span>
                    <ActionForm intent="revoke_link" label="Revoke" hidden={{ linkId: l.id }} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <section aria-labelledby="org-jobs-heading" className="mt-6">
        <h2 id="org-jobs-heading" className="mb-3 text-xl font-bold">
          Listings
        </h2>
        {jobs.length ? (
          <JobTable jobs={jobs} basePath="/manage/jobs" showEmployer={false} />
        ) : (
          <p className="text-ink-muted">No listings yet.</p>
        )}
      </section>

      <section
        aria-labelledby="details-heading"
        className="mt-6 rounded-lg border border-line bg-surface p-4 sm:p-5"
      >
        <h2 id="details-heading" className="mb-4 text-xl font-bold">
          Details
        </h2>
        <OrganizationForm
          values={result?.values ?? org}
          errors={result?.errors}
          submitLabel="Save details"
        />
      </section>
    </>
  );
}
