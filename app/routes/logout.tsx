import { redirect } from "react-router";
import { getServices, hasSessionCookie } from "~/lib/context.server";
import type { Route } from "./+types/logout";

export async function action({ request, context }: Route.ActionArgs) {
  const headers = new Headers();
  if (hasSessionCookie(request)) {
    const auth = await getServices(context).auth();
    const result = await auth.api.signOut({ headers: request.headers, returnHeaders: true });
    for (const cookie of result.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  }
  return redirect("/", { headers });
}

export function loader() {
  return redirect("/");
}
