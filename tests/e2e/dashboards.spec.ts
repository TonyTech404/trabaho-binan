import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser } from "@playwright/test";
import { jobByTitle, query, STATE } from "./helpers";

async function as(browser: Browser, state: string) {
  const context = await browser.newContext({ storageState: state });
  return { context, page: await context.newPage() };
}

/** A signed-out context. Plain browser.newContext() would inherit the file's storageState. */
function anonymous(browser: Browser) {
  return browser.newContext({ storageState: { cookies: [], origins: [] } });
}

test.describe("employer boundaries", () => {
  test.use({ storageState: STATE.employerA });

  test("employer sees only their own jobs", async ({ page }) => {
    await page.goto("/employer");
    await expect(page.getByRole("heading", { name: "Your jobs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Warehouse Helper" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Kitchen Staff" })).toHaveCount(0); // Employer B's job
  });

  test("another organization's job is not found, even by direct URL or request", async ({
    page,
  }) => {
    const other = await jobByTitle("Barista"); // belongs to employer B
    const res = await page.goto(`/employer/jobs/${other.id}`);
    expect(res?.status()).toBe(404);

    // Crafted form posts to another organization's job are refused.
    const close = await page.request.post(`/employer/jobs/${other.id}`, {
      form: { intent: "withdraw" },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(close.status()).toBe(404);
    const [row] = await query<{ status: string }>("select status from jobs where id = $1", [
      other.id,
    ]);
    expect(row.status).toBe("pending_review");
  });

  test("employers cannot reach staff pages or publish", async ({ page }) => {
    const res = await page.goto("/manage");
    expect(res?.status()).toBe(403);
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();

    const own = await jobByTitle("Inventory Clerk");
    const approve = await page.request.post(`/manage/jobs/${own.id}`, {
      form: { intent: "approve" },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(approve.status()).toBe(403);
    const [row] = await query<{ status: string }>("select status from jobs where id = $1", [
      own.id,
    ]);
    expect(row.status).toBe("draft");
  });

  test("cross-site form posts are rejected", async ({ page }) => {
    await page.goto("/employer");
    const own = await jobByTitle("Inventory Clerk");
    const res = await page.request.post(`/employer/jobs/${own.id}`, {
      form: { intent: "submit" },
      headers: { origin: "https://evil.example" },
    });
    expect(res.status()).toBe(403);
  });

  test("posts a job, sees validation errors, and submits it for review", async ({ page }) => {
    await page.goto("/employer/jobs/new");
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText(/Fix \d+ problems to continue/)).toBeVisible();

    await page.getByLabel("Job title").fill("E2E Forklift Operator");
    await page.getByLabel("Job type").selectOption("full_time");
    await page
      .getByLabel("Job description")
      .fill("Operate a forklift safely in the warehouse and help with loading.");
    await page.getByLabel("Minimum education").selectOption("high_school");
    await page.getByLabel("Experience required").selectOption("1_to_2_years");
    await page
      .getByLabel("Walk-in instructions")
      .fill("Walk in at the warehouse office, weekdays 9 AM.");
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Submitted for review.")).toBeVisible();
    await expect(page.getByText("Pending review").first()).toBeVisible();

    // Not public until approved.
    const job = await jobByTitle("E2E Forklift Operator");
    const pub = await page.request.get(`/jobs/${job.public_id}/${job.slug}`);
    expect(pub.status()).toBe(404);
  });
});

test.describe("review and publication", () => {
  test.use({ storageState: STATE.reviewer });

  test("reviewer approves a submission and it becomes public", async ({ page, browser }) => {
    // Employer submits a fresh job.
    const employer = await as(browser, STATE.employerA);
    await employer.page.goto("/employer/jobs/new");
    await employer.page.getByLabel("Job title").fill("E2E Approved Packer");
    await employer.page.getByLabel("Job type").selectOption("temporary");
    await employer.page
      .getByLabel("Job description")
      .fill("Pack orders for delivery and label boxes accurately.");
    await employer.page.getByLabel("Minimum education").selectOption("none");
    await employer.page.getByLabel("Experience required").selectOption("none");
    await employer.page.getByLabel("Application email").fill("jobs@example.com");
    await employer.page.getByRole("button", { name: "Submit for review" }).click();
    await expect(employer.page.getByText("Submitted for review.")).toBeVisible();

    await page.goto("/manage/review");
    await page.getByRole("link", { name: "E2E Approved Packer" }).click();
    await page.getByRole("button", { name: "Approve and publish" }).click();
    await expect(page.getByText("Approved and published.")).toBeVisible();

    const job = await jobByTitle("E2E Approved Packer");
    await page.goto(`/?q=E2E%20Approved`);
    await expect(page.getByRole("link", { name: "E2E Approved Packer" })).toBeVisible();

    // The employer closes it once filled; it leaves search and stops accepting applications.
    await employer.page.goto(`/employer/jobs/${job.id}`);
    await employer.page.locator("summary", { hasText: "Close this job" }).click();
    await employer.page.getByRole("button", { name: "Close job now" }).click();
    await expect(employer.page.getByText("Listing closed.")).toBeVisible();
    const anon = await anonymous(browser);
    const anonPage = await anon.newPage();
    await anonPage.goto(`/?q=E2E%20Approved`);
    await expect(anonPage.getByRole("link", { name: "E2E Approved Packer" })).toHaveCount(0);
    const apply = await anonPage.request.get(`/apply/${job.public_id}?via=email`, {
      maxRedirects: 0,
    });
    expect(apply.headers().location).toBe(`/jobs/${job.public_id}/${job.slug}`);
    await anon.close();
    await employer.context.close();
  });

  test("reviewer requests changes with a reason the employer can read", async ({
    page,
    browser,
  }) => {
    await page.goto("/manage/review");
    await page.getByRole("link", { name: "Barista" }).click();
    await expect(page.getByText("Check this wording before publishing")).toBeVisible();
    await expect(page.getByText("Age requirement").first()).toBeVisible();
    await page.locator("summary", { hasText: "Request changes" }).first().click();
    await page
      .getByLabel("What needs to change?")
      .fill("Remove the age and gender requirements (RA 10911).");
    await page.getByRole("button", { name: "Send back to employer" }).click();
    await expect(page.getByText("Sent back to the employer with your notes.")).toBeVisible();

    const employer = await as(browser, STATE.employerB);
    const job = await jobByTitle("Barista");
    await employer.page.goto(`/employer/jobs/${job.id}`);
    await expect(
      employer.page.getByText("Remove the age and gender requirements (RA 10911).").first(),
    ).toBeVisible();
    await employer.context.close();
  });

  test("reviewer pauses a reported listing straight away", async ({ page, browser }) => {
    await page.goto("/manage/reports");
    const report = page.locator("li", { hasText: "Possible scam or asks for fees" }).first();
    await report.locator("summary", { hasText: "Pause listing" }).click();
    await report.getByLabel("Why pause it?").fill("Investigating a reported fee request.");
    await report.locator("form button[type=submit]", { hasText: "Pause listing" }).click();
    await expect(page.getByText(/Listing paused/)).toBeVisible();

    const job = await jobByTitle("Production Operator");
    const anon = await anonymous(browser);
    const anonPage = await anon.newPage();
    await anonPage.goto(`/jobs/${job.public_id}/${job.slug}`);
    await expect(anonPage.getByText("This listing is temporarily unavailable")).toBeVisible();
    await anon.close();
  });

  test("approving an employer's revision updates the live listing", async ({ page }) => {
    const job = await jobByTitle("Delivery Rider (Motorcycle)");
    await page.goto(`/manage/jobs/${job.id}`);
    await expect(page.getByRole("heading", { name: /Proposed edit/ })).toBeVisible();
    await expect(page.getByText("Live now").first()).toBeVisible();
    await page.getByRole("button", { name: "Approve changes" }).click();
    await expect(page.getByText("Changes approved and live.")).toBeVisible();
    await page.goto(`/jobs/${job.public_id}/${job.slug}`);
    await expect(page.getByText("₱19,000 – ₱23,000 per month").first()).toBeVisible();
  });

  test("exports listings as CSV", async ({ page }) => {
    await page.goto("/manage/jobs");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^trabaho-binan-jobs-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test("dashboard pages have no serious accessibility violations", async ({ page }) => {
    const job = await jobByTitle("Cashier");
    for (const path of [
      "/manage",
      "/manage/review",
      "/manage/jobs",
      `/manage/jobs/${job.id}`,
      "/manage/jobs/new",
      "/manage/employers",
      "/manage/reports",
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
});

test.describe("administration", () => {
  test.use({ storageState: STATE.admin });

  test("invites a reviewer who accepts and signs in", async ({ page, browser }) => {
    await page.goto("/manage/users");
    await page.getByLabel("Email address").fill("new.reviewer@example.test");
    await page.getByRole("button", { name: "Create invitation link" }).click();
    const link = await page.locator("#one-time-link").inputValue();
    expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);

    const fresh = await anonymous(browser);
    const invitee = await fresh.newPage();
    await invitee.goto(new URL(link).pathname);
    await invitee.getByLabel("Your full name").fill("New Reviewer");
    await invitee.getByLabel("Create a password").fill("a-long-new-password");
    await invitee.getByLabel("Type the password again").fill("a-long-new-password");
    await invitee.getByRole("button", { name: "Create account" }).click();
    await expect(invitee).toHaveURL(/\/manage\?welcome=1/);
    await expect(invitee.getByText("Welcome, New Reviewer.")).toBeVisible();

    // The link cannot be used again.
    const again = await fresh.newPage();
    await again.goto(new URL(link).pathname);
    await expect(
      again.getByRole("heading", { name: "This invitation can't be used" }),
    ).toBeVisible();
    await fresh.close();
  });

  test("issues a password reset link that ends the user's other sessions", async ({
    page,
    browser,
  }) => {
    const reviewer = await as(browser, STATE.reviewer);
    await reviewer.page.goto("/manage");
    await expect(reviewer.page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await page.goto("/manage/users");
    const row = page.locator("li", { hasText: "Demo Reviewer" });
    await row.getByRole("button", { name: "Password reset link" }).click();
    const link = await page.locator("#one-time-link").inputValue();

    const fresh = await anonymous(browser);
    const resetPage = await fresh.newPage();
    await resetPage.goto(new URL(link).pathname);
    await resetPage.getByLabel("New password", { exact: true }).fill("e2e-password-123");
    await resetPage.getByLabel("Type the new password again").fill("e2e-password-123");
    await resetPage.getByRole("button", { name: "Save new password" }).click();
    await expect(resetPage).toHaveURL(/\/login\?reset=1/);
    await fresh.close();

    // The reviewer's existing session no longer works.
    await reviewer.page.goto("/manage");
    await expect(reviewer.page).toHaveURL(/\/login/);
    await reviewer.context.close();
  });

  test("suspending an employer account revokes access immediately", async ({ page, browser }) => {
    const employer = await as(browser, STATE.employerB);
    await employer.page.goto("/employer");
    await expect(employer.page.getByRole("heading", { name: "Your jobs" })).toBeVisible();

    await page.goto("/manage/users");
    await page
      .locator("li", { hasText: "employer.b@example.test" })
      .getByRole("button", { name: "Suspend" })
      .click();
    await expect(page.getByText("Account updated.")).toBeVisible();

    await employer.page.goto("/employer");
    await expect(employer.page).toHaveURL(/\/login/);
    await employer.context.close();

    await page.goto("/manage/users");
    await page
      .locator("li", { hasText: "employer.b@example.test" })
      .getByRole("button", { name: "Reactivate" })
      .click();
    await expect(page.getByText("Account updated.")).toBeVisible();
  });

  test("records an audit history of management actions", async ({ page }) => {
    await page.goto("/manage/audit?type=job");
    await expect(page.getByRole("heading", { name: "Audit history" })).toBeVisible();
    await expect(page.getByText("(job.approve)").first()).toBeVisible();
  });
});
