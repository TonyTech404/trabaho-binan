import { expect, type Page } from "@playwright/test";
import pg from "pg";

export const PASSWORD = "e2e-password-123";
export const STATE = {
  admin: "playwright/.auth/admin.json",
  reviewer: "playwright/.auth/reviewer.json",
  employerA: "playwright/.auth/employer-a.json",
  employerB: "playwright/.auth/employer-b.json",
};

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Read-only lookups against the E2E database to find synthetic records. */
export async function query<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

export async function jobByTitle(title: string) {
  const [row] = await query<{ id: string; public_id: string; slug: string; status: string }>(
    "select id, public_id, slug, status from jobs where title = $1 order by created_at desc limit 1",
    [title],
  );
  if (!row) throw new Error(`No job titled ${title}`);
  return row;
}
