/**
 * Log-safe error descriptions. Workers Logs keep everything for days, so logs
 * must never hold passwords, applicants' details or account-link tokens.
 *
 * Database errors are the risk: Drizzle puts every query parameter (including
 * the plaintext password given to bcrypt, and applicants' names and phone
 * numbers) into its error message, and Postgres messages can quote input. For
 * those only the error code, constraint and table are kept.
 */
export function describeError(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) return { error: typeof error };
  const db = databaseError(error);
  if (db) {
    const out: Record<string, string> = { error: "DatabaseError" };
    for (const key of ["code", "constraint", "table", "routine"] as const) {
      if (typeof db[key] === "string") out[key] = db[key];
    }
    return out;
  }
  return { error: error.name, message: error.message.slice(0, 300) };
}

type PgFields = { code?: unknown; constraint?: unknown; table?: unknown; routine?: unknown };

function databaseError(error: Error): PgFields | null {
  const cause = error.cause as (PgFields & Error) | undefined;
  if (error.name === "DrizzleQueryError" || error.message.startsWith("Failed query")) {
    return cause ?? {};
  }
  // node-postgres errors carry a five-character SQLSTATE code.
  const own = error as Error & PgFields;
  if (typeof own.code === "string" && /^[0-9A-Z]{5}$/.test(own.code)) return own;
  return null;
}

/** The request path with account-link tokens (and other long ids) masked. */
export function loggablePath(url: string) {
  return new URL(url).pathname.replace(/[A-Za-z0-9_-]{32,}/g, ":token");
}
