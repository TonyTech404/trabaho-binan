import { data, Form, redirect, useNavigation } from "react-router";
import { getServices } from "~/lib/context.server";
import { withinRateLimit } from "~/lib/rate-limit.server";
import { dashboardPathFor, getViewer, safeNextPath } from "~/lib/session.server";
import type { Route } from "./+types/login";

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await getViewer(request, context);
  if (viewer) throw redirect(dashboardPathFor(viewer.role));
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const services = getServices(context);
  if (!(await withinRateLimit(services.env.AUTH_LIMITER, request, "login"))) {
    return data(
      { error: "Too many sign-in attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }
  const form = await request.formData();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? ""), "");
  if (!email || !password) {
    return data({ error: "Enter your email and password." }, { status: 400 });
  }

  const auth = await services.auth();
  try {
    const result = await auth.api.signInEmail({
      body: { email, password, rememberMe: true },
      headers: request.headers,
      returnHeaders: true,
    });
    const headers = new Headers();
    for (const cookie of result.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
    const role = (result.response.user as { role?: string }).role;
    const fallback = role === "employer" ? "/employer" : "/manage";
    return redirect(next || fallback, { headers });
  } catch {
    // Same message for unknown email, wrong password and suspended accounts.
    return data({ error: "The email or password is incorrect." }, { status: 401 });
  }
}

export default function Login({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <main>
      <h1>Sign in</h1>
      <Form method="post">
        {actionData?.error ? <p role="alert">{actionData.error}</p> : null}
        <label>
          Email <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password{" "}
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={navigation.state === "submitting"}>
          Sign in
        </button>
      </Form>
    </main>
  );
}
