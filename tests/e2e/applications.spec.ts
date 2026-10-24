import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser } from "@playwright/test";
import { jobByTitle, STATE } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

function anonymous(browser: Browser) {
  return browser.newContext({ storageState: { cookies: [], origins: [] } });
}

test.describe("applications with a résumé", () => {
  test("a jobseeker applies and only the employer and staff can see it", async ({ browser }) => {
    const applicant = `E2E Applicant ${Date.now()}`;
    const job = await jobByTitle("Kitchen Staff"); // employer B's job, accepts applications

    // Jobseeker, no account.
    const visitor = await anonymous(browser);
    const page = await visitor.newPage();
    await page.goto(`/jobs/${job.public_id}/${job.slug}`);
    await page.getByRole("link", { name: "Apply with your résumé" }).click();
    await expect(page.getByRole("heading", { name: "Apply for Kitchen Staff" })).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);

    await page.getByLabel("Full name").fill(applicant);
    await page.getByLabel("Email address").fill("e2e-applicant@example.test");
    await page.getByLabel("Résumé", { exact: true }).setInputFiles({
      name: "My CV.exe",
      mimeType: "application/pdf",
      buffer: Buffer.from("MZ not really a pdf"),
    });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send application" }).click();
    await expect(page.getByText("Upload your résumé as a PDF or Word file").first()).toBeVisible();

    await page.getByLabel("Résumé", { exact: true }).setInputFiles({
      name: "My CV.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send application" }).click();
    await expect(page.getByText("Your application was sent")).toBeVisible();
    await expect(page.getByText(/TB-[0-9A-Z]{6}/)).toBeVisible();

    // The employer that owns the job.
    const owner = await browser.newContext({ storageState: STATE.employerB });
    const ownerPage = await owner.newPage();
    await ownerPage.goto("/employer/applications");
    await ownerPage.getByRole("link", { name: applicant }).click();
    await expect(ownerPage.getByRole("heading", { name: applicant })).toBeVisible();
    const applicationUrl = ownerPage.url();
    const id = applicationUrl.split("/").pop();
    const [download] = await Promise.all([
      ownerPage.waitForEvent("download"),
      ownerPage.getByRole("link", { name: "Download résumé" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("My CV.pdf");
    await ownerPage.getByLabel("Status").selectOption("shortlisted");
    await ownerPage.getByRole("button", { name: "Save status" }).click();
    await expect(ownerPage.getByText("Application status saved.")).toBeVisible();

    // Another employer: not found, by page or by direct download request.
    const other = await browser.newContext({ storageState: STATE.employerA });
    const otherPage = await other.newPage();
    expect((await otherPage.goto(`/employer/applications/${id}`))?.status()).toBe(404);
    expect((await otherPage.request.get(`/applications/${id}/resume`)).status()).toBe(404);
    await expect(async () => {
      await otherPage.goto("/employer/applications");
      await expect(otherPage.getByRole("link", { name: applicant })).toHaveCount(0);
    }).toPass();

    // Signed out: sent to sign in, never the file.
    const res = await page.request.get(`/applications/${id}/resume`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toMatch(/^\/login/);

    // Staff see every application.
    const staff = await browser.newContext({ storageState: STATE.reviewer });
    const staffPage = await staff.newPage();
    await staffPage.goto("/manage/applications");
    await expect(staffPage.getByRole("link", { name: applicant })).toBeVisible();

    await Promise.all([visitor.close(), owner.close(), other.close(), staff.close()]);
  });

  test("jobs that do not take applications here keep their own instructions", async ({
    browser,
  }) => {
    const job = await jobByTitle("Machine Maintenance Technician");
    const visitor = await anonymous(browser);
    const page = await visitor.newPage();
    await page.goto(`/jobs/${job.public_id}/${job.slug}`);
    await expect(page.getByRole("link", { name: "Apply with your résumé" })).toHaveCount(0);
    await page.goto(`/apply/${job.public_id}/form`);
    await expect(page).toHaveURL(new RegExp(`/jobs/${job.public_id}/`));
    await visitor.close();
  });
});
