import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { jobByTitle, STATE } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
// A phone-style photo with GPS coordinates, camera make and a rotation flag in its EXIF.
const PHOTO = readFileSync(new URL("./fixtures/cv-photo-with-gps.jpg", import.meta.url));

function anonymous(browser: Browser) {
  return browser.newContext({ storageState: { cookies: [], origins: [] } });
}

async function apply(
  page: Page,
  job: { public_id: string; slug: string },
  fields: { name: string; phone: string; experience?: string },
  files: { name: string; mimeType: string; buffer: Buffer }[] = [],
) {
  await page.goto(`/jobs/${job.public_id}/${job.slug}`);
  await page.getByRole("link", { name: "Apply now" }).click();
  await expect(page.getByRole("heading", { name: /^Apply for/ })).toBeVisible();
  await page.getByLabel("Full name").fill(fields.name);
  await page.getByLabel("Mobile number").fill(fields.phone);
  if (fields.experience) await page.getByLabel("Work experience").fill(fields.experience);
  if (files.length) {
    await page.getByLabel("Résumé or photos").setInputFiles(files);
    await expect(page.getByRole("list", { name: "Files to send" })).toBeVisible();
  }
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(page.getByText("Your application was sent")).toBeVisible();
  return (await page.getByText(/^TB-[0-9A-Z]{6}$/).innerText()).trim();
}

test.describe("applications", () => {
  test("a jobseeker applies with a photo; only the employer and staff can see it", async ({
    browser,
  }) => {
    const applicant = `E2E Applicant ${Date.now()}`;
    const job = await jobByTitle("Kitchen Staff"); // employer B's job, accepts applications

    const visitor = await anonymous(browser);
    const page = await visitor.newPage();
    await page.goto(`/jobs/${job.public_id}/${job.slug}`);
    await page.getByRole("link", { name: "Apply now" }).click();
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);

    // The mobile number is required and checked; a résumé is not.
    await page.getByLabel("Full name").fill(applicant);
    await page.getByLabel("Mobile number").fill("12345");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send application" }).click();
    await expect(
      page.getByText("Enter a mobile number, for example 0917 123 4567.").first(),
    ).toBeVisible();

    const reference = await apply(page, job, { name: applicant, phone: "0917 555 0101" }, [
      { name: "my cv.pdf", mimeType: "application/pdf", buffer: PDF },
      { name: "page 2.jpg", mimeType: "image/jpeg", buffer: PHOTO },
    ]);

    // The applicant can check their status with the reference and phone number.
    await page.getByRole("main").getByRole("link", { name: "Check your application" }).click();
    await expect(page.getByLabel("Reference")).toHaveValue(reference);
    await page.getByLabel("Mobile number or email").fill("+63 917 555 0101");
    await page.getByRole("button", { name: "Check status" }).click();
    await expect(page.getByRole("heading", { name: "Sent" })).toBeVisible();

    // The employer that owns the job: call/text buttons and both files.
    const owner = await browser.newContext({ storageState: STATE.employerB });
    const ownerPage = await owner.newPage();
    await ownerPage.goto("/employer/applications");
    await ownerPage.getByRole("link", { name: applicant }).click();
    await expect(ownerPage.getByRole("heading", { name: applicant })).toBeVisible();
    await expect(ownerPage.getByRole("link", { name: "Call" })).toHaveAttribute(
      "href",
      "tel:+639175550101",
    );
    await expect(ownerPage.getByRole("link", { name: "Text" })).toHaveAttribute(
      "href",
      "sms:+639175550101",
    );
    await expect(ownerPage.getByText("0917 555 0101").first()).toBeVisible();
    const photo = ownerPage.getByRole("img", { name: /page 2\.jpg/ });
    await expect(photo).toBeVisible();
    const photoUrl = (await photo.getAttribute("src"))!;
    const stored = await ownerPage.request.get(photoUrl);
    expect(stored.status()).toBe(200);
    expect((await stored.body()).toString("latin1")).not.toContain("TestPhone");
    const [download] = await Promise.all([
      ownerPage.waitForEvent("download"),
      ownerPage.getByRole("link", { name: /Download my cv\.pdf/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("my cv.pdf");

    // Another employer: not found, by page or by direct file request.
    const other = await browser.newContext({ storageState: STATE.employerA });
    const otherPage = await other.newPage();
    expect((await otherPage.goto(new URL(ownerPage.url()).pathname))?.status()).toBe(404);
    expect((await otherPage.request.get(photoUrl)).status()).toBe(404);

    // Signed out: sent to sign in, never the file.
    const res = await page.request.get(photoUrl, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toMatch(/^\/login/);

    // Staff see every application.
    const staff = await browser.newContext({ storageState: STATE.reviewer });
    const staffPage = await staff.newPage();
    await staffPage.goto("/manage/applications");
    await expect(staffPage.getByRole("link", { name: applicant })).toBeVisible();

    await Promise.all([visitor.close(), owner.close(), other.close(), staff.close()]);
  });

  test("after a hire, the employer closes the job and the others are told", async ({ browser }) => {
    // Employer B posts a job that takes applications here (on by default); staff publish it.
    const employer = await browser.newContext({ storageState: STATE.employerB });
    const ePage = await employer.newPage();
    await ePage.goto("/employer/jobs/new");
    await ePage.getByLabel("Job title").fill("E2E Line Cook");
    await ePage.getByLabel("Job type").selectOption("full_time");
    await ePage
      .getByLabel("Job description")
      .fill("Prepare dishes on the line during lunch and dinner service.");
    await ePage.getByLabel("Minimum education").selectOption("high_school");
    await ePage.getByLabel("Experience required").selectOption("none");
    await ePage.getByRole("button", { name: "Submit for review" }).click();
    await expect(ePage.getByText("Submitted for review.")).toBeVisible();
    const staff = await browser.newContext({ storageState: STATE.reviewer });
    const sPage = await staff.newPage();
    await sPage.goto("/manage/review");
    await sPage.getByRole("link", { name: "E2E Line Cook" }).click();
    await sPage.getByRole("button", { name: "Approve and publish" }).click();
    await expect(sPage.getByText("Approved and published.")).toBeVisible();
    const job = await jobByTitle("E2E Line Cook");

    // Two applicants; one has no résumé at all.
    const visitor = await anonymous(browser);
    const vPage = await visitor.newPage();
    await apply(vPage, job, { name: "E2E Hired Cook", phone: "0918 000 1111" });
    const otherRef = await apply(vPage, job, {
      name: "E2E Waiting Cook",
      phone: "0918 000 2222",
      experience: "One year as a kitchen helper in Biñan.",
    });

    // Hire the first, then close the job and settle the rest.
    await ePage.goto("/employer/applications");
    await ePage.getByRole("link", { name: "E2E Hired Cook" }).click();
    await ePage.getByLabel("Status").selectOption("hired");
    await ePage.getByRole("button", { name: "Save status" }).click();
    await expect(ePage.getByRole("heading", { name: "Position filled?" })).toBeVisible();
    await expect(ePage.getByRole("checkbox")).toBeChecked();
    await ePage.getByRole("button", { name: "Close job" }).click();
    await expect(ePage.getByText(/Closed jobs leave the listings/)).toBeVisible();

    // The listing is closed, and the other applicant can see the outcome.
    await vPage.goto(`/jobs/${job.public_id}/${job.slug}`);
    await expect(vPage.getByText("This vacancy is closed")).toBeVisible();
    await vPage.goto("/application-status");
    await vPage.getByLabel("Reference").fill(otherRef);
    await vPage.getByLabel("Mobile number or email").fill("0918 000 2222");
    await vPage.getByRole("button", { name: "Check status" }).click();
    await expect(vPage.getByRole("heading", { name: "Not selected" })).toBeVisible();

    // A wrong number reveals nothing.
    await vPage.getByLabel("Reference").fill(otherRef);
    await vPage.getByLabel("Mobile number or email").fill("0918 999 9999");
    await vPage.getByRole("button", { name: "Check status" }).click();
    await expect(vPage.getByText("No application found")).toBeVisible();

    // PESO sees the hire on the overview.
    await sPage.goto("/manage");
    await expect(sPage.getByText(/hired through Trabaho Biñan/)).toBeVisible();

    await Promise.all([employer.close(), staff.close(), visitor.close()]);
  });

  test("jobs that do not take applications here keep their own instructions", async ({
    browser,
  }) => {
    const job = await jobByTitle("Machine Maintenance Technician");
    const visitor = await anonymous(browser);
    const page = await visitor.newPage();
    await page.goto(`/jobs/${job.public_id}/${job.slug}`);
    await expect(page.getByRole("link", { name: "Apply now" })).toHaveCount(0);
    await page.goto(`/apply/${job.public_id}/form`);
    await expect(page).toHaveURL(new RegExp(`/jobs/${job.public_id}/`));
    await visitor.close();
  });
});
