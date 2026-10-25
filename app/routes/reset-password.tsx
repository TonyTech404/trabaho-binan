import { CircleSlash } from "lucide-react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { AuthCard } from "~/components/auth-card";
import { ErrorSummary, Field } from "~/components/form/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { parseNewPassword } from "~/lib/auth-forms.server";
import { PASSWORD_MIN_LENGTH } from "~/lib/constants";
import { getServices } from "~/lib/context.server";
import { withinRateLimit } from "~/lib/rate-limit.server";
import type { FieldErrors } from "~/lib/validation";
import { findUsableLink, resetPassword } from "~/services/account-links.server";
import { ServiceError } from "~/services/common.server";
import type { Route } from "./+types/reset-password";

export const meta = () => [
  { title: "Choose a new password — Trabaho Biñan" },
  { name: "robots", content: "noindex" },
];

const tokenPageHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

// The link's token is in the URL: never cache the page or send it as a referrer.
export function headers() {
  return tokenPageHeaders;
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const db = await getServices(context).db();
  const row = await findUsableLink(db, params.token, "password_reset");
  return data({ email: row?.userEmail ?? null }, { headers: tokenPageHeaders });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const services = getServices(context);
  if (!(await withinRateLimit(services.env.AUTH_LIMITER, request, "reset"))) {
    return data(
      { errors: { form: "Too many attempts. Wait a minute and try again." } as FieldErrors },
      { status: 429 },
    );
  }
  const db = await services.db();
  const row = await findUsableLink(db, params.token, "password_reset");
  if (!row)
    return data(
      { errors: { form: "This link has expired or was already used." } as FieldErrors },
      { status: 410 },
    );
  const pw = parseNewPassword(await request.formData(), { email: row.userEmail });
  if (pw.errors || !pw.password) return data({ errors: pw.errors ?? {} }, { status: 400 });
  try {
    await resetPassword(db, params.token, pw.password);
  } catch (error) {
    if (error instanceof ServiceError)
      return data({ errors: { form: error.message } as FieldErrors }, { status: error.status });
    throw error;
  }
  // All sessions were revoked; sign in again with the new password.
  return redirect("/login?reset=1", { headers: tokenPageHeaders });
}

export default function ResetPassword({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  if (!loaderData.email) {
    return (
      <AuthCard title="This link can't be used">
        <div className="space-y-4">
          <p className="flex gap-2">
            <CircleSlash aria-hidden="true" className="mt-1 size-5 shrink-0 text-danger" />
            Password reset links work once and expire after 24 hours. Ask for a new link.
          </p>
          <Link to="/login" className="link inline-flex min-h-11 items-center">
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }
  const errors = actionData?.errors;
  return (
    <AuthCard
      title="Choose a new password"
      description={<p>For {loaderData.email}. You will be signed out on other devices.</p>}
    >
      <Form method="post" className="space-y-5" noValidate>
        <ErrorSummary
          errors={errors}
          labels={{ password: "New password", confirmPassword: "Confirm password" }}
        />
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
        <Button type="submit" className="w-full" disabled={navigation.state === "submitting"}>
          Save new password
        </Button>
      </Form>
    </AuthCard>
  );
}
