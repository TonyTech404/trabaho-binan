import { CircleSlash } from "lucide-react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import { AuthCard } from "~/components/auth-card";
import { ErrorSummary, Field } from "~/components/form/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { parseName, parseNewPassword, sessionHeaders } from "~/lib/auth-forms.server";
import { PASSWORD_MIN_LENGTH } from "~/lib/constants";
import { getServices } from "~/lib/context.server";
import { ROLES, label } from "~/lib/labels";
import { withinRateLimit } from "~/lib/rate-limit.server";
import type { FieldErrors } from "~/lib/validation";
import { acceptInvitation, findUsableLink } from "~/services/account-links.server";
import { ServiceError } from "~/services/common.server";
import type { Route } from "./+types/invite";

export const meta = () => [
  { title: "Accept your invitation — Trabaho Biñan" },
  { name: "robots", content: "noindex" },
];

// The link's token is in the URL: never cache the page or send it as a referrer.
export function headers() {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const db = await getServices(context).db();
  const row = await findUsableLink(db, params.token, "invitation");
  if (!row)
    return data(
      { invitation: null },
      { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
    );
  return data(
    {
      invitation: {
        email: row.link.email,
        role: row.link.role,
        organizationName: row.organizationName,
        expiresAt: row.link.expiresAt,
      },
    },
    { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
  );
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const services = getServices(context);
  if (!(await withinRateLimit(services.env.AUTH_LIMITER, request, "invite"))) {
    return data(
      { errors: { form: "Too many attempts. Wait a minute and try again." } as FieldErrors },
      { status: 429 },
    );
  }
  const db = await services.db();
  const link = await findUsableLink(db, params.token, "invitation");
  if (!link)
    return data(
      { errors: { form: "This invitation has expired or was already used." } as FieldErrors },
      { status: 410 },
    );

  const form = await request.formData();
  const { name, error: nameError } = parseName(form);
  const pw = parseNewPassword(form, { email: link.link.email });
  const errors: FieldErrors = { ...(nameError ? { name: nameError } : {}), ...(pw.errors ?? {}) };
  if (Object.keys(errors).length || !name || !pw.password) return data({ errors }, { status: 400 });

  let user;
  try {
    user = await acceptInvitation(db, params.token, { name, password: pw.password });
  } catch (error) {
    if (error instanceof ServiceError)
      return data({ errors: { form: error.message } as FieldErrors }, { status: error.status });
    throw error;
  }
  // The account exists now. If signing in fails for any reason, send the
  // person to the sign-in page rather than showing an error for a used link.
  try {
    const auth = await services.auth();
    const result = await auth.api.signInEmail({
      body: { email: user.email, password: pw.password, rememberMe: true },
      headers: request.headers,
      returnHeaders: true,
    });
    return redirect(user.role === "employer" ? "/employer?welcome=1" : "/manage?welcome=1", {
      headers: sessionHeaders(result.headers),
    });
  } catch {
    return redirect("/login");
  }
}

export default function Invite({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const invitation = loaderData.invitation;
  if (!invitation) {
    return (
      <AuthCard title="This invitation can't be used">
        <div className="space-y-4">
          <p className="flex gap-2">
            <CircleSlash aria-hidden="true" className="mt-1 size-5 shrink-0 text-danger" />
            The link has expired, was already used, or was replaced by a newer invitation. Ask the
            person who invited you for a new link.
          </p>
          <Link to="/login" className="link inline-flex min-h-11 items-center">
            Already have an account? Sign in
          </Link>
        </div>
      </AuthCard>
    );
  }
  const errors = actionData?.errors;
  return (
    <AuthCard
      title="Set up your account"
      description={
        <p>
          You were invited as{" "}
          {invitation.role === "employer"
            ? "an employer"
            : `a ${label(ROLES, invitation.role).toLowerCase()}`}
          {invitation.organizationName ? (
            <>
              {" "}
              for <span className="font-semibold text-ink">{invitation.organizationName}</span>
            </>
          ) : null}
          .
        </p>
      }
    >
      <Form method="post" className="space-y-5" noValidate>
        <ErrorSummary
          errors={errors}
          labels={{ name: "Name", password: "Password", confirmPassword: "Confirm password" }}
        />
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Email address</p>
          <p className="rounded-md border border-line bg-muted px-3 py-2.5 [overflow-wrap:anywhere]">
            {invitation.email}
          </p>
        </div>
        <Field name="name" label="Your full name" error={errors?.name} required>
          {(p) => <Input {...p} autoComplete="name" />}
        </Field>
        <Field
          name="password"
          label="Create a password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence is easy to remember.`}
          error={errors?.password}
          required
        >
          {(p) => <Input {...p} type="password" autoComplete="new-password" />}
        </Field>
        <Field
          name="confirmPassword"
          label="Type the password again"
          error={errors?.confirmPassword}
          required
        >
          {(p) => <Input {...p} type="password" autoComplete="new-password" />}
        </Field>
        <Button type="submit" className="w-full" disabled={navigation.state === "submitting"}>
          {navigation.state === "submitting" ? "Creating account…" : "Create account"}
        </Button>
      </Form>
    </AuthCard>
  );
}
