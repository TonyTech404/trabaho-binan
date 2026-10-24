import { data, Form, redirect } from "react-router";
import { ActionError, ActionForm } from "~/components/dashboard/job-panels";
import { OneTimeLink } from "~/components/dashboard/link-result";
import { NoticeBanner } from "~/components/dashboard/notice";
import { PageHeader } from "~/components/dashboard/shell";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { getServices } from "~/lib/context.server";
import { label, ROLES } from "~/lib/labels";
import { serviceErrorResult, withNotice } from "~/lib/route-helpers.server";
import { requireAdminViewer } from "~/lib/session.server";
import { describeAge, formatDate } from "~/lib/time";
import { emailSchema } from "~/lib/validation";
import {
  accountLinkUrl,
  createInvitation,
  createPasswordReset,
  listOpenLinks,
  revokeAccountLink,
} from "~/services/account-links.server";
import { listUsers, revokeSessions, setStaffRole, setUserStatus } from "~/services/users.server";
import type { Route } from "./+types/users";

export const meta = () => [{ title: "Users and access — Review dashboard" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const viewer = await requireAdminViewer(request, context);
  const db = await getServices(context).db();
  const [users, links] = await Promise.all([listUsers(db, viewer), listOpenLinks(db, viewer)]);
  return { users, links, viewerId: viewer.id };
}

export async function action({ request, context }: Route.ActionArgs) {
  const viewer = await requireAdminViewer(request, context);
  const services = getServices(context);
  const db = await services.db();
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const userId = String(form.get("userId") ?? "");
  try {
    switch (intent) {
      case "invite_staff": {
        const email = emailSchema.safeParse(form.get("email"));
        const role = form.get("role") === "admin" ? "admin" : "reviewer";
        if (!email.success)
          return data({ inviteError: "Enter a valid email address." }, { status: 400 });
        const { link, token } = await createInvitation(db, viewer, { email: email.data, role });
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
        const { link, token } = await createPasswordReset(db, viewer, userId);
        return {
          oneTimeLink: {
            url: accountLinkUrl(services.baseUrl, link, token),
            expiresAt: link.expiresAt,
            purpose: link.purpose,
            email: link.email ?? "",
          },
        };
      }
      case "suspend":
      case "reactivate":
        await setUserStatus(db, viewer, userId, intent === "suspend" ? "suspended" : "active");
        break;
      case "make_admin":
      case "make_reviewer":
        await setStaffRole(db, viewer, userId, intent === "make_admin" ? "admin" : "reviewer");
        break;
      case "sign_out":
        await revokeSessions(db, viewer, userId);
        break;
      case "revoke_link":
        await revokeAccountLink(db, viewer, String(form.get("linkId") ?? ""));
        return redirect(withNotice("/manage/users", "link_revoked"));
      default:
        return data({ error: "Unknown action." }, { status: 400 });
    }
    return redirect(withNotice("/manage/users", "user_updated"));
  } catch (error) {
    return serviceErrorResult(error);
  }
}

export default function Users({ loaderData, actionData }: Route.ComponentProps) {
  const { users, links, viewerId } = loaderData;
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
      }
    | undefined;
  return (
    <>
      <PageHeader
        title="Users and access"
        description="Staff and employer accounts. Suspending an account signs it out everywhere immediately."
      />
      <NoticeBanner />
      <ActionError error={result?.error} />
      {result?.oneTimeLink ? <OneTimeLink {...result.oneTimeLink} /> : null}

      <section
        aria-labelledby="invite-heading"
        className="mb-6 rounded-lg border border-line bg-surface p-4"
      >
        <h2 id="invite-heading" className="text-xl font-bold">
          Invite staff
        </h2>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">
          Reviewers approve listings, verify employers and handle reports. Administrators also
          manage access and settings. To invite an employer, open the employer's page.
        </p>
        <Form method="post" className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="invite_staff" />
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="staff-email">Email address</Label>
            <Input
              id="staff-email"
              name="email"
              type="email"
              autoComplete="off"
              aria-invalid={result?.inviteError ? true : undefined}
              aria-describedby={result?.inviteError ? "staff-email-error" : undefined}
            />
          </div>
          <div className="w-44 space-y-1.5">
            <Label htmlFor="staff-role">Role</Label>
            <NativeSelect id="staff-role" name="role" defaultValue="reviewer">
              <NativeSelectOption value="reviewer">Reviewer</NativeSelectOption>
              <NativeSelectOption value="admin">Administrator</NativeSelectOption>
            </NativeSelect>
          </div>
          <Button type="submit">Create invitation link</Button>
        </Form>
        {result?.inviteError ? (
          <p id="staff-email-error" className="mt-2 text-sm font-semibold text-danger">
            {result.inviteError}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="accounts-heading">
        <h2 id="accounts-heading" className="mb-3 text-xl font-bold">
          Accounts
        </h2>
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {users.map((u) => (
            <li key={u.id} className="space-y-2 px-4 py-3">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{u.name}</span>
                <Badge variant={u.role === "employer" ? "neutral" : "info"}>
                  {label(ROLES, u.role)}
                </Badge>
                {u.status === "suspended" ? <Badge variant="danger">Suspended</Badge> : null}
                {u.id === viewerId ? <Badge variant="neutral">You</Badge> : null}
              </p>
              <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">
                {u.email}
                {u.organizationName ? `, ${u.organizationName}` : ""}. Joined{" "}
                {formatDate(u.createdAt)}, last active{" "}
                {u.lastActiveAt ? describeAge(u.lastActiveAt) : "never"}.
              </p>
              {u.id !== viewerId ? (
                <div className="flex flex-wrap gap-2">
                  <ActionForm
                    intent="reset_link"
                    label="Password reset link"
                    hidden={{ userId: u.id }}
                  />
                  <ActionForm
                    intent="sign_out"
                    label="Sign out everywhere"
                    hidden={{ userId: u.id }}
                  />
                  {u.role === "reviewer" ? (
                    <ActionForm
                      intent="make_admin"
                      label="Make administrator"
                      hidden={{ userId: u.id }}
                    />
                  ) : null}
                  {u.role === "admin" ? (
                    <ActionForm
                      intent="make_reviewer"
                      label="Make reviewer"
                      hidden={{ userId: u.id }}
                    />
                  ) : null}
                  {u.status === "active" ? (
                    <ActionForm
                      intent="suspend"
                      label="Suspend"
                      variant="destructive-outline"
                      hidden={{ userId: u.id }}
                    />
                  ) : (
                    <ActionForm intent="reactivate" label="Reactivate" hidden={{ userId: u.id }} />
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {links.length ? (
        <section aria-labelledby="links-heading" className="mt-6">
          <h2 id="links-heading" className="mb-3 text-xl font-bold">
            Unused links
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {links.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <span className="text-sm [overflow-wrap:anywhere]">
                  {l.purpose === "invitation"
                    ? `Invitation (${label(ROLES, l.role)})`
                    : "Password reset"}{" "}
                  for {l.email}
                  {l.organizationName ? `, ${l.organizationName}` : ""}. Expires{" "}
                  {formatDate(l.expiresAt)}.
                </span>
                <ActionForm intent="revoke_link" label="Revoke" hidden={{ linkId: l.id }} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
