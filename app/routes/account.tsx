import { data, Form, redirect, useNavigation } from "react-router";
import { NoticeBanner } from "~/components/dashboard/notice";
import { DashboardShell, employerNav, PageHeader, staffNav } from "~/components/dashboard/shell";
import { ErrorSummary, Field } from "~/components/form/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { parseNewPassword, sessionHeaders } from "~/lib/auth-forms.server";
import { PASSWORD_MIN_LENGTH } from "~/lib/constants";
import { getServices } from "~/lib/context.server";
import { label, ROLES } from "~/lib/labels";
import { withinRateLimit } from "~/lib/rate-limit.server";
import { withNotice } from "~/lib/route-helpers.server";
import { requireViewer } from "~/lib/session.server";
import type { FieldErrors } from "~/lib/validation";
import { revokeResetLinks } from "~/services/account-links.server";
import { recordAudit } from "~/services/common.server";
import { countNewApplications } from "~/services/applications.server";
import { getStaffNavCounts } from "~/services/job-queries.server";
import type { Route } from "./+types/account";

export const meta = () => [
  { title: "Your account — Trabaho Biñan" },
  { name: "robots", content: "noindex" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireViewer(request, context);
  const services = getServices(context);
  const db = await services.db();
  const [jobCounts, applications] = await Promise.all([
    viewer.role === "employer" ? { review: 0, reports: 0 } : getStaffNavCounts(db),
    countNewApplications(db, viewer),
  ]);
  const counts = { ...jobCounts, applications };
  return {
    appEnv: services.env.APP_ENV,
    viewer: {
      name: viewer.name,
      email: viewer.email,
      role: viewer.role,
      organizationName: viewer.organizationName,
    },
    counts,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const viewer = await requireViewer(request, context);
  const services = getServices(context);
  if (!(await withinRateLimit(services.env.AUTH_LIMITER, request, "password"))) {
    return data(
      { errors: { form: "Too many attempts. Wait a minute and try again." } as FieldErrors },
      { status: 429 },
    );
  }
  const form = await request.formData();
  const currentPassword = String(form.get("currentPassword") ?? "");
  const pw = parseNewPassword(form, { email: viewer.email });
  if (!currentPassword)
    return data(
      {
        errors: {
          currentPassword: "Enter your current password.",
          ...(pw.errors ?? {}),
        } as FieldErrors,
      },
      { status: 400 },
    );
  if (pw.errors || !pw.password) return data({ errors: pw.errors ?? {} }, { status: 400 });

  const auth = await services.auth();
  let result;
  try {
    result = await auth.api.changePassword({
      body: { currentPassword, newPassword: pw.password, revokeOtherSessions: true },
      headers: request.headers,
      returnHeaders: true,
    });
  } catch {
    return data(
      { errors: { currentPassword: "Your current password is incorrect." } as FieldErrors },
      { status: 400 },
    );
  }
  // The password has changed; anything failing below is a real error, not a wrong password.
  const db = await services.db();
  await revokeResetLinks(db, viewer.id);
  await recordAudit(db, viewer, {
    action: "user.password_change",
    entityType: "user",
    entityId: viewer.id,
    summary: `${viewer.email} changed their password`,
  });
  return redirect(withNotice("/account", "password_changed"), {
    headers: sessionHeaders(result.headers),
  });
}

export default function Account({ loaderData, actionData }: Route.ComponentProps) {
  const { viewer, appEnv, counts } = loaderData;
  const navigation = useNavigation();
  const errors = actionData?.errors;
  const items = viewer.role === "employer" ? employerNav(counts) : staffNav(viewer.role, counts);
  return (
    <DashboardShell
      appEnv={appEnv}
      title={viewer.role === "employer" ? "Employer dashboard" : "Review dashboard"}
      viewer={viewer}
      items={items}
    >
      <PageHeader
        title="Your account"
        description={`${viewer.name}, ${viewer.email}. ${label(ROLES, viewer.role)}${viewer.organizationName ? ` for ${viewer.organizationName}` : ""}.`}
      />
      <NoticeBanner />
      <section
        aria-labelledby="pw-heading"
        className="max-w-xl rounded-lg border border-line bg-surface p-4 sm:p-5"
      >
        <h2 id="pw-heading" className="text-xl font-bold">
          Change password
        </h2>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">
          You will stay signed in here and be signed out on other devices.
        </p>
        <Form method="post" className="mt-4 space-y-5" noValidate>
          <ErrorSummary
            errors={errors}
            labels={{
              currentPassword: "Current password",
              password: "New password",
              confirmPassword: "Confirm password",
            }}
          />
          <Field
            name="currentPassword"
            label="Current password"
            error={errors?.currentPassword}
            required
          >
            {(p) => <Input {...p} type="password" autoComplete="current-password" />}
          </Field>
          <Field
            name="password"
            label="New password"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            error={errors?.password}
            required
          >
            {(p) => <Input {...p} type="password" autoComplete="new-password" />}
          </Field>
          <Field
            name="confirmPassword"
            label="Type the new password again"
            error={errors?.confirmPassword}
            required
          >
            {(p) => <Input {...p} type="password" autoComplete="new-password" />}
          </Field>
          <Button type="submit" disabled={navigation.state === "submitting"}>
            Change password
          </Button>
        </Form>
      </section>
    </DashboardShell>
  );
}
