import { data, type RouterContextProvider } from "react-router";
import { ForbiddenError, InputError, NotFoundError, ServiceError } from "~/services/common.server";
import { getServices } from "./context.server";
import { purgePublicPaths } from "./public-cache.server";
import { fieldErrors, formToObject, jobInputSchema, type FieldErrors } from "./validation";

/**
 * Convert a service error into a route response. Not-found and forbidden are
 * thrown (error boundary); conflicts and input errors are returned for the
 * form to display.
 */
export function serviceErrorResult(error: unknown) {
  if (error instanceof NotFoundError) throw data(error.message, { status: 404 });
  if (error instanceof ForbiddenError) throw data(error.message, { status: 403 });
  if (error instanceof ServiceError) {
    return data(
      {
        error: error.message,
        errors: (error instanceof InputError ? error.fieldErrors : {}) as FieldErrors,
      },
      { status: error.status },
    );
  }
  throw error;
}

export function withNotice(path: string, notice: string) {
  return `${path}${path.includes("?") ? "&" : "?"}notice=${encodeURIComponent(notice)}`;
}

/** Drop cached public copies of a job's pages after a lifecycle change. */
export async function purgeJobPages(
  context: Readonly<RouterContextProvider>,
  job: { publicId: string; slug: string },
  extra: string[] = [],
) {
  const services = getServices(context);
  await purgePublicPaths(services.baseUrl, [
    "/",
    `/jobs/${job.publicId}`,
    `/jobs/${job.publicId}/${job.slug}`,
    ...extra,
  ]);
}

export function parseJobForm(form: FormData) {
  const raw = formToObject(form);
  const values = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;
  const parsed = jobInputSchema().safeParse(raw);
  if (!parsed.success) return { ok: false as const, errors: fieldErrors(parsed.error), values };
  return { ok: true as const, input: parsed.data, values };
}

export function reasonFrom(form: FormData, field = "reason") {
  const value = String(form.get(field) ?? "").trim();
  return value.length >= 3 ? value.slice(0, 1000) : null;
}
