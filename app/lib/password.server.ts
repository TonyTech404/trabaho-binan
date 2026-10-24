import { sql } from "drizzle-orm";
import type { DbOrTx } from "~/services/common.server";

/**
 * Password hashing runs inside PostgreSQL (pgcrypto bcrypt) instead of the
 * Worker. Workers Free allows 10 ms of CPU per request; scrypt or PBKDF2 at a
 * safe work factor exceeds that. The password travels over the TLS
 * connection as a bound parameter and is never logged by the application.
 */
export const BCRYPT_COST = 10;

export async function hashPassword(db: DbOrTx, password: string): Promise<string> {
  const result = await db.execute<{ hash: string }>(
    sql`select crypt(${password}, gen_salt('bf', ${BCRYPT_COST})) as hash`,
  );
  const hash = result.rows[0]?.hash;
  if (!hash) throw new Error("Password hashing failed");
  return hash;
}

export async function verifyPassword(db: DbOrTx, hash: string, password: string): Promise<boolean> {
  if (!hash.startsWith("$2")) return false;
  const result = await db.execute<{ ok: boolean }>(
    sql`select crypt(${password}, ${hash}) = ${hash} as ok`,
  );
  return result.rows[0]?.ok === true;
}
