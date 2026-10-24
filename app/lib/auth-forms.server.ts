import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./constants";
import { cleanText, fieldErrors, type FieldErrors } from "./validation";

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
      .refine(
        (v) => new TextEncoder().encode(v).length <= PASSWORD_MAX_LENGTH,
        `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
      ),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords do not match.",
  });

export function parseNewPassword(form: FormData, extra?: { email?: string | null }) {
  const result = newPasswordSchema.safeParse({
    password: String(form.get("password") ?? ""),
    confirmPassword: String(form.get("confirmPassword") ?? ""),
  });
  if (!result.success) return { errors: fieldErrors(result.error) as FieldErrors };
  if (
    extra?.email &&
    result.data.password.toLowerCase().includes(extra.email.split("@")[0].toLowerCase())
  ) {
    return {
      errors: { password: "Do not use your email address in your password." } as FieldErrors,
    };
  }
  return { password: result.data.password };
}

export function parseName(form: FormData): { name?: string; error?: string } {
  const name = cleanText(form.get("name"));
  if (name.length < 2) return { error: "Enter your name." };
  if (name.length > 100) return { error: "Use 100 characters or fewer." };
  return { name };
}

/** Copy Better Auth's Set-Cookie headers onto a response. */
export function sessionHeaders(source: Headers) {
  const headers = new Headers();
  for (const cookie of source.getSetCookie()) headers.append("Set-Cookie", cookie);
  return headers;
}
