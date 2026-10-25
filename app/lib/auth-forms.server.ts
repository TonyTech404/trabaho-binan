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

/**
 * Words that make a password easy to guess however many digits or symbols
 * follow them: the commonest passwords, and this site's own names.
 */
const GUESSABLE_WORDS = new Set([
  "password",
  "passw0rd",
  "qwerty",
  "qwertyuiop",
  "asdfghjkl",
  "iloveyou",
  "welcome",
  "admin",
  "administrator",
  "letmein",
  "changeme",
  "abcdefghij",
  "trabaho",
  "trabahobinan",
  "bantaybinan",
  "binan",
  "peso",
  "pesobinan",
  "philippines",
  "pilipinas",
  "mahalkita",
]);

/** True for passwords an attacker would try first. */
export function isGuessablePassword(password: string) {
  const plain = password
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/^(.)\1+$/.test(plain)) return true; // "aaaaaaaaaa"
  if ("01234567890123456789".includes(plain) || "98765432109876543210".includes(plain)) return true;
  const word = plain.replace(/[^a-z0-9]+/g, "").replace(/\d+$/, "");
  return GUESSABLE_WORDS.has(word) || /^\d+$/.test(plain);
}

export function parseNewPassword(form: FormData, extra?: { email?: string | null }) {
  const result = newPasswordSchema.safeParse({
    password: String(form.get("password") ?? ""),
    confirmPassword: String(form.get("confirmPassword") ?? ""),
  });
  if (!result.success) return { errors: fieldErrors(result.error) as FieldErrors };
  if (isGuessablePassword(result.data.password)) {
    return {
      errors: {
        password: "This password is too easy to guess. Try a few unrelated words together.",
      } as FieldErrors,
    };
  }
  // Short address names ("hr@…") would rule out too many ordinary passwords.
  const localPart = extra?.email?.split("@")[0].toLowerCase() ?? "";
  if (localPart.length >= 4 && result.data.password.toLowerCase().includes(localPart)) {
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
