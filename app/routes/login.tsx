import { data, Form, Link, redirect, useNavigation } from "react-router";
import { AuthCard } from "~/components/auth-card";
import { Field, FormMessage } from "~/components/form/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { sessionHeaders } from "~/lib/auth-forms.server";
import { getServices } from "~/lib/context.server";
import { withinRateLimit } from "~/lib/rate-limit.server";
import { dashboardPathFor, getViewer, safeNextPath } from "~/lib/session.server";
import type { Route } from "./+types/login";

export const meta = () => [
  { title: "Sign in — Trabaho Biñan" },
  { name: "robots", content: "noindex" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await getViewer(request, context);
  if (viewer) throw redirect(dashboardPathFor(viewer.role));
  const url = new URL(request.url);
  return {
    next: safeNextPath(url.searchParams.get("next"), ""),
    reset: url.searchParams.has("reset"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const services = getServices(context);
  const form = await request.formData();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? ""), "");

  if (!(await withinRateLimit(services.env.AUTH_LIMITER, request, "login"))) {
    return data(
      { error: "Too many sign-in attempts. Wait a minute and try again.", email },
      { status: 429 },
    );
  }
  if (!email || !password) {
    return data({ error: "Enter your email address and password.", email }, { status: 400 });
  }

  const auth = await services.auth();
  try {
    const result = await auth.api.signInEmail({
      body: { email, password, rememberMe: true },
      headers: request.headers,
      returnHeaders: true,
    });
    const role = (result.response.user as { role?: string }).role;
    return redirect(next || (role === "employer" ? "/employer" : "/manage"), {
      headers: sessionHeaders(result.headers),
    });
  } catch {
    // One message for unknown email, wrong password and suspended accounts.
    return data({ error: "The email address or password is incorrect.", email }, { status: 401 });
  }
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  return (
    <AuthCard
      title="Sign in"
      description={
        <p>
          For invited employers and review staff. Jobseekers do not need an account to browse or
          apply.
        </p>
      }
    >
      <Form method="post" className="space-y-5" noValidate>
        <input type="hidden" name="next" value={loaderData.next} />
        {loaderData.reset ? (
          <FormMessage tone="success">
            Your password was changed. Sign in with your new password.
          </FormMessage>
        ) : null}
        {actionData?.error ? <FormMessage>{actionData.error}</FormMessage> : null}
        <Field name="email" label="Email address" required>
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="username"
              inputMode="email"
              defaultValue={actionData?.email ?? ""}
            />
          )}
        </Field>
        <Field name="password" label="Password" required>
          {(p) => <Input {...p} type="password" autoComplete="current-password" />}
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center">
          <Link to="/forgot-password" className="link inline-flex min-h-11 items-center">
            Forgot your password?
          </Link>
        </p>
      </Form>
    </AuthCard>
  );
}
