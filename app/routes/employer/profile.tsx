import { ExternalLink } from "lucide-react";
import { data, Link, redirect } from "react-router";
import { NoticeBanner } from "~/components/dashboard/notice";
import { OrganizationForm } from "~/components/dashboard/org-form";
import { PageHeader } from "~/components/dashboard/shell";
import { VerificationBadge } from "~/components/dashboard/status";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { buttonVariants } from "~/components/ui/button";
import { getServices } from "~/lib/context.server";
import { label, ORGANIZATION_TYPES } from "~/lib/labels";
import { withNotice } from "~/lib/route-helpers.server";
import { requireEmployerViewer } from "~/lib/session.server";
import { describeAge } from "~/lib/time";
import { fieldErrors, formToObject, organizationProfileSchema } from "~/lib/validation";
import {
  getOrganizationForActor,
  listOrganizationMembers,
  updateOwnOrganizationProfile,
} from "~/services/organizations.server";
import type { Route } from "./+types/profile";

export const meta = () => [{ title: "Company profile — Employer dashboard" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireEmployerViewer(request, context);
  const db = await getServices(context).db();
  const org = await getOrganizationForActor(db, viewer, viewer.organizationId!);
  const { internalNotes: _internal, ...organization } = org;
  return { organization, members: await listOrganizationMembers(db, viewer, org.id) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const viewer = await requireEmployerViewer(request, context);
  const services = getServices(context);
  const raw = formToObject(await request.formData());
  // Only public profile fields are accepted; name, type and verification stay with reviewers.
  const parsed = organizationProfileSchema.safeParse(raw);
  if (!parsed.success)
    return data(
      { errors: fieldErrors(parsed.error), values: raw as Record<string, string> },
      { status: 400 },
    );
  const { submitted } = await updateOwnOrganizationProfile(
    await services.db(),
    viewer,
    parsed.data,
  );
  return redirect(
    withNotice("/employer/profile", submitted ? "profile_submitted" : "profile_saved"),
  );
}

export default function EmployerProfileSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { organization: org, members } = loaderData;
  return (
    <>
      <PageHeader
        title="Company profile"
        description={
          <p className="flex flex-wrap items-center gap-2">
            {org.name}, {label(ORGANIZATION_TYPES, org.type).toLowerCase()}
            <VerificationBadge status={org.verificationStatus} />
          </p>
        }
        actions={
          <Link
            to={`/employers/${org.slug}`}
            target="_blank"
            className={buttonVariants({ variant: "outline" })}
          >
            Public page
            <ExternalLink aria-hidden="true" />
          </Link>
        }
      />
      <NoticeBanner />
      <p className="mb-5 max-w-2xl text-ink-muted">
        These details appear on your public employer page and on your job listings. The review team
        checks changes before they appear. To change the organization name or type, or to ask about
        verification, contact the review team.
      </p>
      {org.pendingProfile ? (
        <Alert className="mb-5">
          <AlertTitle>Your changes are waiting for review</AlertTitle>
          <AlertDescription>
            Your public page shows the approved details until a reviewer approves the changes. You
            can still edit them below.
          </AlertDescription>
        </Alert>
      ) : org.profileReviewNote ? (
        <Alert variant="warning" className="mb-5">
          <AlertTitle>Your last changes were not approved</AlertTitle>
          <AlertDescription>
            <p className="whitespace-pre-line">{org.profileReviewNote}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
        <OrganizationForm
          profileOnly
          values={actionData?.values ?? { ...org, ...org.pendingProfile }}
          errors={actionData?.errors}
          submitLabel="Save profile"
        />
      </div>
      <section
        aria-labelledby="team-heading"
        className="mt-6 rounded-lg border border-line bg-surface p-4"
      >
        <h2 id="team-heading" className="text-xl font-bold">
          People with access
        </h2>
        <ul className="mt-2 divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="py-2">
              <span className="font-semibold">{m.name}</span>
              <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted">
                {m.email}, last signed in {m.lastActiveAt ? describeAge(m.lastActiveAt) : "never"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-ink-muted">
          To add or remove someone, ask the review team.
        </p>
      </section>
    </>
  );
}
