import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { jobByTitle, query } from "./helpers";

async function openJobCount(extra = "") {
  const [row] = await query<{ n: number }>(
    `select count(*)::int as n from jobs j join organizations o on o.id = j.organization_id
     where j.status = 'published' and j.deadline_at > now() and o.verification_status <> 'suspended' ${extra}`,
  );
  return row.n;
}

test.describe("public job directory", () => {
  test("lists open jobs without an account and filters by education", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Find work in Biñan" })).toBeVisible();
    await expect(page.getByText("sample listings only")).toBeVisible();

    const results = page.getByRole("heading", { level: 2, name: /open jobs?$/ });
    const total = await openJobCount();
    await expect(results).toHaveText(`${total} open jobs`);
    // Closed, expired, draft and pending listings are not in search results.
    await expect(page.getByRole("link", { name: "Seasonal Packer" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Quality Inspector" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Barista" })).toHaveCount(0);

    await page.goto("/?education=high_school");
    const filtered = await openJobCount("and j.education_level <= 'high_school'");
    await expect(results).toHaveText(`${filtered} open job${filtered === 1 ? "" : "s"}`);
    expect(filtered).toBeLessThan(total);
    await expect(page.getByRole("link", { name: "Cashier" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Accounting Clerk" })).toHaveCount(0);
    await page.getByRole("link", { name: /Education: High school graduate/ }).click();
    await expect(results).toHaveText(`${total} open jobs`);
  });

  test("searches by title prefix and company name", async ({ page }) => {
    await page.goto("/?q=cash");
    await expect(page.getByRole("link", { name: "Cashier" })).toBeVisible();
    await page.goto("/?q=Demo%20Logistics");
    await expect(page.getByRole("link", { name: "Warehouse Helper" })).toBeVisible();
    await page.goto("/?q=zzzz-no-such-job");
    await expect(page.getByRole("heading", { name: "No jobs match your search" })).toBeVisible();
  });

  test("shows complete job details and clear application instructions", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Cashier" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Cashier" })).toBeVisible();
    await expect(page.getByText("₱500 – ₱610 per day").first()).toBeVisible();
    const apply = page.locator("#how-to-apply");
    await expect(apply.getByRole("heading", { name: "How to apply" })).toBeVisible();
    await expect(apply.getByText("Walk in Monday to Friday, 9:00 AM–3:00 PM.")).toBeVisible();
    await expect(
      apply.getByText("Bring a printed résumé or biodata and one valid ID."),
    ).toBeVisible();
    await expect(apply.getByText("Never pay to apply")).toBeVisible();
  });

  test("shows 'Not disclosed' when pay is missing", async ({ page }) => {
    const job = await jobByTitle("Warehouse Helper");
    await page.goto(`/jobs/${job.public_id}/${job.slug}`);
    await expect(page.getByText("Not disclosed")).toBeVisible();
  });

  test("redirects old or partial job URLs to the canonical address", async ({ page }) => {
    const job = await jobByTitle("Cashier");
    await page.goto(`/jobs/${job.public_id}`);
    await expect(page).toHaveURL(new RegExp(`/jobs/${job.public_id}/${job.slug}$`));
  });

  test("keeps closed and expired job pages but disables applying", async ({ page, request }) => {
    const closed = await jobByTitle("Seasonal Packer");
    await page.goto(`/jobs/${closed.public_id}/${closed.slug}`);
    await expect(page.getByText("This vacancy is closed")).toBeVisible();
    await expect(page.getByText("Applications are closed for this listing.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the application page" })).toHaveCount(0);

    const expired = await jobByTitle("Quality Inspector");
    await page.goto(`/jobs/${expired.public_id}/${expired.slug}`);
    await expect(page.getByText(/Applications closed on/)).toBeVisible();

    // Even a direct request to the apply link is refused for closed jobs.
    const res = await request.get(`/apply/${closed.public_id}?via=walkin`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toBe(`/jobs/${closed.public_id}/${closed.slug}`);
  });

  test("sends applicants to the approved application link only", async ({ request }) => {
    const job = await jobByTitle("Delivery Rider (Motorcycle)");
    const res = await request.get(`/apply/${job.public_id}?via=url`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toBe("https://example.com/apply/demo-delivery-rider");
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("hides unpublished jobs from direct URLs", async ({ page }) => {
    const pending = await jobByTitle("Barista");
    const response = await page.goto(`/jobs/${pending.public_id}/${pending.slug}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("lets anyone report a listing", async ({ page }) => {
    const job = await jobByTitle("Kitchen Staff");
    await page.goto(`/jobs/${job.public_id}/${job.slug}`);
    await page.getByRole("link", { name: "Report a problem with this listing" }).click();
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText(/Fix 1 problem/)).toBeVisible();
    await page.getByLabel("Job is filled or no longer available").check();
    await page.getByLabel(/Details/).fill("Synthetic E2E report.");
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText("Thank you. Your report was sent.")).toBeVisible();
  });

  test("sends security headers and a nonce-based CSP", async ({ request }) => {
    const res = await request.get("/");
    const headers = res.headers();
    expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("is usable with the keyboard", async ({ page, isMobile }) => {
    test.skip(isMobile, "Keyboard navigation is checked on desktop.");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("searchbox", { name: "Job title, company or skill" }),
    ).toBeFocused();
    await page.keyboard.type("cashier");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=cashier/);
    await expect(page.getByRole("link", { name: "Cashier" })).toBeVisible();
  });

  test("has no serious accessibility violations on key public pages", async ({ page }) => {
    const job = await jobByTitle(
      "Customer Service Representative — English and Tagalog Speaking, Night Shift, Account Assignment Based in Laguna Technopark",
    );
    for (const path of [
      "/",
      `/jobs/${job.public_id}/${job.slug}`,
      "/help",
      "/login",
      `/report/${job.public_id}`,
    ]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        serious,
        `${path}: ${serious.map((v) => `${v.id} (${v.nodes.length})`).join(", ")}`,
      ).toEqual([]);
    }
  });

  test("does not scroll sideways on small screens", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Checked on the mobile project.");
    const job = await jobByTitle(
      "Customer Service Representative — English and Tagalog Speaking, Night Shift, Account Assignment Based in Laguna Technopark",
    );
    for (const path of ["/", `/jobs/${job.public_id}/${job.slug}`, "/help"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
