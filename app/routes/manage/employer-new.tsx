import { ArrowLeft } from "lucide-react";
import { data, Link, redirect } from "react-router";
import { OrganizationForm } from "~/components/dashboard/org-form";
import { PageHeader } from "~/components/dashboard/shell";
import { getServices } from "~/lib/context.server";
import { withNotice } from "~/lib/route-helpers.server";
import { requireStaffViewer } from "~/lib/session.server";
import { fieldErrors, formToObject, organizationInputSchema } from "~/lib/validation";
import { createOrganization } from "~/services/organizations.server";
import type { Route } from "./+types/employer-new";

export const meta = () => [{ title: "Add employer — Review dashboard" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireStaffViewer(request, context);
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const viewer = await requireStaffViewer(request, context);
  const raw = formToObject(await request.formData());
  const parsed = organizationInputSchema.safeParse(raw);
  if (!parsed.success)
    return data(
      { errors: fieldErrors(parsed.error), values: raw as Record<string, string> },
      { status: 400 },
    );
  const org = await createOrganization(await getServices(context).db(), viewer, parsed.data);
  return redirect(withNotice(`/manage/employers/${org.id}`, "org_created"));
}

export default function NewEmployer({ actionData }: Route.ComponentProps) {
  return (
    <>
      <PageHeader
        back={
          <Link to="/manage/employers" className="link inline-flex min-h-11 items-center gap-1.5">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Employers
          </Link>
        }
        title="Add employer"
        description="Record the organization first. You can verify it and invite its staff afterwards."
      />
      <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
        <OrganizationForm
          values={actionData?.values}
          errors={actionData?.errors}
          submitLabel="Add employer"
        />
      </div>
    </>
  );
}
