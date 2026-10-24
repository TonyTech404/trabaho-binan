import { test as setup } from "@playwright/test";
import { signIn, STATE } from "./helpers";

const accounts: [keyof typeof STATE, string][] = [
  ["admin", "admin@example.test"],
  ["reviewer", "reviewer@example.test"],
  ["employerA", "employer.a@example.test"],
  ["employerB", "employer.b@example.test"],
];

for (const [key, email] of accounts) {
  setup(`sign in as ${key}`, async ({ page }) => {
    await signIn(page, email);
    await page.context().storageState({ path: STATE[key] });
  });
}
