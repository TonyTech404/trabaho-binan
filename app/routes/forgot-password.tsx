import { Link } from "react-router";
import { AuthCard } from "~/components/auth-card";
import { getServices } from "~/lib/context.server";
import { getSiteSettings } from "~/services/settings.server";
import type { Route } from "./+types/forgot-password";

export const meta = () => [
  { title: "Forgot your password? — Trabaho Biñan" },
  { name: "robots", content: "noindex" },
];

export async function loader({ context }: Route.LoaderArgs) {
  const db = await getServices(context).db();
  return { settings: await getSiteSettings(db) };
}

export default function ForgotPassword({ loaderData }: Route.ComponentProps) {
  const { settings } = loaderData;
  return (
    <AuthCard title="Forgot your password?">
      <div className="space-y-4 text-ink">
        <p>
          Password reset links are issued by people, not sent automatically. Ask{" "}
          {settings.operatorName} for a new link. Employers can also ask the reviewer who invited
          them.
        </p>
        {settings.contactEmail || settings.contactPhone ? (
          <ul className="space-y-1">
            {settings.contactEmail ? (
              <li>
                Email:{" "}
                <a className="link" href={`mailto:${settings.contactEmail}`}>
                  {settings.contactEmail}
                </a>
              </li>
            ) : null}
            {settings.contactPhone ? <li>Phone: {settings.contactPhone}</li> : null}
          </ul>
        ) : null}
        <p className="text-sm text-ink-muted">
          A reset link works once and expires after 24 hours. Nobody from the site will ask for your
          password.
        </p>
        <Link to="/login" className="link inline-flex min-h-11 items-center">
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
