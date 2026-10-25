/**
 * Records every scene of both demo videos from a live site.
 *
 *   node scripts/capture.mjs desktop|mobile [--base https://trabaho.bantaybinan.com] [--resolve host:ip] [--only a,b]
 *
 * Needs the demo accounts from demo-setup.ts. Creates one clearly labelled
 * demo vacancy per run (publicly visible until demo-cleanup.ts runs), applies
 * to it, and marks the demo applicant hired, which closes it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, devices } from "playwright";
import { actions, OVERLAY_SCRIPT, Recorder, sleep } from "./lib/recorder.mjs";

const args = process.argv.slice(2);
const format = args[0];
if (!["desktop", "mobile"].includes(format)) {
  console.error("Usage: node scripts/capture.mjs desktop|mobile [--base URL] [--resolve host:ip]");
  process.exit(1);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const BASE = opt("base", "https://trabaho.bantaybinan.com");
const RESOLVE = opt("resolve", null);
const ONLY = opt("only", null)?.split(",");
const ROOT = new URL("..", import.meta.url).pathname;
const creds = JSON.parse(
  readFileSync(new URL("../../.secrets/demo-accounts.json", import.meta.url)),
);
const touch = format === "mobile";
const OUT = join(ROOT, "footage", format);
const DEMO_JOB = touch
  ? "Store Cashier (DEMO – not a real vacancy)"
  : "Bakery Helper (DEMO – not a real vacancy)";
const DEMO_EDUCATION = touch
  ? { level: "senior_high", course: "Accountancy, Business and Management (ABM) strand" }
  : { level: "vocational", course: "Bread and Pastry Production NC II" };
// Not an assigned Philippine mobile prefix, so no real person can be reached.
const DEMO_MOBILE = "0900 000 1234";

const contextOptions = touch
  ? { ...devices["iPhone 14"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 }
  : { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 };

const browser = await chromium.launch({
  args: RESOLVE
    ? [`--host-resolver-rules=MAP ${RESOLVE.split(":")[0]} ${RESOLVE.split(":")[1]}`]
    : [],
});

async function newPage(email) {
  const context = await browser.newContext({ ...contextOptions, baseURL: BASE, locale: "en-PH" });
  await context.addInitScript(OVERLAY_SCRIPT);
  const page = await context.newPage();
  if (email) {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(creds.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  }
  const rec = new Recorder(page, OUT, { touch, size: touch ? "1170:2532" : "2560:1440" });
  return { page, rec, act: actions(page, touch) };
}

async function scene(name, who, fn) {
  if (ONLY && !ONLY.includes(name)) return;
  await fn(who);
}
async function record(who, name, fn) {
  await who.rec.start(name);
  try {
    await fn();
  } finally {
    await who.rec.stop();
  }
}
const settle = (page) => page.waitForLoadState("networkidle").catch(() => {});

// Sample résumé, as a phone photo of a printed page, used by the jobseeker scene.
async function makeResumePhoto() {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.setContent(`<html><body style="margin:0;height:100vh;display:grid;place-items:center;
    background:radial-gradient(circle at 30% 20%,#c9b48f,#a88d63)">
    <div style="width:680px;height:960px;background:#fbfaf6;transform:rotate(-2.2deg);
      box-shadow:0 18px 40px rgba(0,0,0,.35);font-family:Helvetica,Arial;color:#1a2620;
      padding:56px;box-sizing:border-box">
    <p style="color:#b42318;font-weight:bold">SAMPLE FOR A DEMO VIDEO — NOT A REAL PERSON</p>
    <h1 style="margin:0;font-size:44px">Juan Dela Cruz</h1><p>Biñan, Laguna</p>
    <h2>Experience</h2><p>Kitchen helper, 2 years. Food handling, cleaning, inventory.</p>
    <h2>Education</h2><p>Senior high school graduate</p></div></body></html>`);
  const path = join(ROOT, "footage", "sample-resume-photo.jpg");
  await page.screenshot({ path, type: "jpeg", quality: 85 });
  await page.close();
  return path;
}

const employer = await newPage(creds.employer.email);
const reviewer = await newPage(creds.reviewer.email);
const admin = await newPage(creds.admin.email);
const visitor = await newPage(null);
const resumePhoto = await makeResumePhoto();
let reference = null; // set when the demo applicant applies
console.log(`Recording ${format} from ${BASE}`);

/* ----------------------------- Employer posts ----------------------------- */
await scene("employer-dashboard", employer, async ({ page, rec, act }) => {
  await page.goto("/employer");
  await settle(page);
  await record(employer, "employer-dashboard", async () => {
    await sleep(900);
    const post = page.getByRole("link", { name: "Post a job" }).first();
    await rec.mark("post", post);
    await act.click(post);
    await page
      .getByRole("heading", { name: /post a job/i })
      .first()
      .waitFor();
    await sleep(700);
  });
});

await scene("employer-form", employer, async ({ page, rec, act }) => {
  if (!page.url().includes("/employer/jobs/new")) await page.goto("/employer/jobs/new");
  await record(employer, "employer-form", async () => {
    await act.type(page.locator('[name="title"]'), DEMO_JOB, 28);
    await act.select(page.locator('[name="employmentType"]'), "full_time");
    await rec.mark("description", page.locator('[name="description"]'));
    await act.type(
      page.locator('[name="description"]'),
      "Demo listing for a how-to video. Not a real vacancy: please do not apply.",
      14,
    );
    await act.select(page.locator('[name="educationLevel"]'), DEMO_EDUCATION.level);
    const course = page.locator('[name="fieldOfStudy"]');
    await rec.mark("course", course);
    await act.type(course, DEMO_EDUCATION.course, 24);
    await act.select(page.locator('[name="experienceLevel"]'), "none");
    await act.type(page.locator('[name="salaryMin"]'), "16000", 60);
    await act.type(page.locator('[name="salaryMax"]'), "18000", 60);
    await act.select(page.locator('[name="salaryPeriod"]'), "month");
    const accepts = page.locator('[name="acceptsApplications"]');
    await act.reveal(accepts, { at: 0.4, ms: 900 });
    await rec.mark("accepts", accepts);
    await act.point(accepts);
    await sleep(900);
    const deadline = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    await act.click(page.locator('[name="deadline"]'));
    await page.locator('[name="deadline"]').fill(deadline);
    await sleep(500);
  });
});

await scene("employer-submit", employer, async ({ page, rec, act }) => {
  await record(employer, "employer-submit", async () => {
    const submit = page.getByRole("button", { name: "Submit for review" });
    await rec.mark("submit", submit);
    await act.click(submit);
    await page
      .getByText(/Submitted for review/)
      .first()
      .waitFor();
    await act.reveal(page.locator("h1").first(), { at: 0.1, ms: 600 });
    await sleep(1500);
  });
});

/* ---------------------------- Reviewer approves --------------------------- */
await scene("reviewer-overview", reviewer, async ({ page, rec, act }) => {
  await page.goto("/manage");
  await settle(page);
  await record(reviewer, "reviewer-overview", async () => {
    await sleep(1200);
    const waiting = page.getByRole("link", { name: /waiting for review/ });
    await rec.mark("waiting", waiting);
    await act.click(waiting);
    await page.getByRole("heading", { name: "Review queue" }).waitFor();
    await sleep(900);
  });
});

await scene("reviewer-approve", reviewer, async ({ page, rec, act }) => {
  if (!page.url().includes("/manage/review")) await page.goto("/manage/review");
  await record(reviewer, "reviewer-approve", async () => {
    await act.click(page.getByRole("link", { name: DEMO_JOB }).first());
    await page.getByRole("heading", { name: DEMO_JOB }).waitFor();
    await sleep(700);
    await act.scrollBy(touch ? 500 : 260, 1100);
    await sleep(500);
    const approve = page.getByRole("button", { name: "Approve and publish" });
    await rec.mark("approve", approve);
    await act.click(approve);
    await page.getByText("Approved and published.").first().waitFor();
    await act.reveal(page.locator("h1").first(), { at: 0.1, ms: 600 });
    await sleep(1400);
  });
});

/* ------------------------------- Jobseeker ------------------------------- */
await scene("visitor-home", visitor, async ({ page, rec, act }) => {
  await page.goto("/");
  await settle(page);
  await record(visitor, "visitor-home", async () => {
    await sleep(1500);
    await rec.mark("results", page.locator("#results-heading"));
    await act.scrollBy(touch ? 1100 : 560, 2200);
    await sleep(700);
    await act.scrollBy(touch ? -1100 : -560, 1200);
    await sleep(300);
  });
});

await scene("visitor-search", visitor, async ({ page, rec, act }) => {
  await record(visitor, "visitor-search", async () => {
    const q = page.getByRole("searchbox", { name: /job title, company or skill/i });
    await act.type(q, "teacher", 90);
    await act.click(page.getByRole("button", { name: "Search", exact: true }));
    await page.waitForURL(/q=teacher/);
    await settle(page);
    await sleep(400);
    await rec.mark("results", page.locator("#results-heading"));
    await act.reveal(page.locator("#results-heading"), { at: 0.15, ms: 900 });
    await sleep(1200);
  });
});

await scene("visitor-filters", visitor, async ({ page, rec, act }) => {
  await page.goto("/");
  await settle(page);
  await record(visitor, "visitor-filters", async () => {
    await sleep(400);
    if (touch) {
      await act.click(page.locator("summary").filter({ hasText: "Filters" }));
      await sleep(400);
    }
    await rec.mark("filters", page.locator('[name="education"]'));
    await act.select(page.locator('[name="type"]'), "full_time");
    await act.select(page.locator('[name="education"]'), "college_graduate");
    await act.click(page.getByRole("button", { name: "Show jobs" }));
    await page.waitForURL(/education=college_graduate/);
    await settle(page);
    await act.reveal(page.locator("#results-heading"), { at: 0.12, ms: 900 });
    await sleep(1400);
  });
});

await scene("visitor-job", visitor, async ({ page, rec, act }) => {
  await page.goto("/?q=master+teacher");
  await settle(page);
  await record(visitor, "visitor-job", async () => {
    await act.click(page.getByRole("link", { name: "Master Teacher I (Elementary)" }));
    await page.getByRole("heading", { name: "Master Teacher I (Elementary)" }).waitFor();
    await sleep(1100);
    const facts = page.getByRole("region", { name: "Key facts" });
    await act.reveal(facts, { at: 0.12, ms: 1100 });
    await rec.mark("facts", facts);
    await sleep(1300);
    const open = page.getByRole("link", { name: /Open the application page/ });
    await act.reveal(open, { at: touch ? 0.45 : 0.4, ms: 1100 });
    await rec.mark("apply", open);
    await act.point(open);
    await sleep(1400);
  });
});

await scene("visitor-apply", visitor, async ({ page, rec, act }) => {
  await page.goto(`/?q=${encodeURIComponent(touch ? "store cashier" : "bakery helper")}`);
  await settle(page);
  await record(visitor, "visitor-apply", async () => {
    await act.click(page.getByRole("link", { name: DEMO_JOB }).first());
    await page.getByRole("heading", { name: DEMO_JOB }).waitFor();
    await sleep(600);
    await act.click(page.getByRole("link", { name: "Apply now" }));
    await page.getByRole("heading", { name: /Apply for/ }).waitFor();
    await sleep(500);
    await act.type(page.getByLabel("Full name"), "Juan Dela Cruz", 55);
    const mobile = page.getByLabel("Mobile number");
    await act.type(mobile, DEMO_MOBILE, 60);
    await rec.mark("mobile", mobile);
    const file = page.getByLabel("Résumé or photos");
    await act.reveal(file, { at: 0.4, ms: 700 });
    await act.point(file);
    await file.setInputFiles({
      name: "resume-photo.jpg",
      mimeType: "image/jpeg",
      buffer: readFileSync(resumePhoto),
    });
    const list = page.getByRole("list", { name: "Files to send" });
    await list.waitFor();
    await rec.mark("files", list);
    await sleep(900);
    await act.click(page.getByRole("checkbox"));
    await act.click(page.getByRole("button", { name: "Send application" }));
    await page.getByText("Your application was sent").waitFor({ timeout: 20000 });
    await act.reveal(page.getByText("Your application was sent"), { at: 0.15, ms: 600 });
    await rec.mark("sent", page.getByText("Your application was sent"));
    reference = (await page.getByText(/^TB-[0-9A-Z]{6}$/).innerText()).trim();
    await sleep(2000);
  });
});

await scene("visitor-safety", visitor, async ({ page, rec, act }) => {
  await page.goto("/?q=master+teacher");
  await settle(page);
  await page.getByRole("link", { name: "Master Teacher I (Elementary)" }).click();
  await page.getByRole("heading", { name: "Master Teacher I (Elementary)" }).waitFor();
  await record(visitor, "visitor-safety", async () => {
    const warn = page.getByText("Never pay to apply").first();
    await act.reveal(warn, { at: 0.3, ms: 1200 });
    await rec.mark("warning", warn);
    await sleep(1500);
    await act.click(page.getByRole("link", { name: "Report this listing" }));
    await page.getByRole("heading", { name: /Report a problem/ }).waitFor();
    await sleep(800);
    await act.click(page.getByText("Possible scam or asks for fees"));
    await sleep(1200);
  });
});

/* --------------------------- Applications inbox --------------------------- */
// A second fictional applicant, off camera, so the hire scene has someone to notify.
async function applyOffCamera(name, mobile) {
  const page = visitor.page;
  await page.goto(`/?q=${encodeURIComponent(touch ? "store cashier" : "bakery helper")}`);
  await page.getByRole("link", { name: DEMO_JOB }).first().click();
  await page.getByRole("link", { name: "Apply now" }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Mobile number").fill(mobile);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send application" }).click();
  await page.getByText("Your application was sent").waitFor({ timeout: 20000 });
}

await scene("employer-applications", employer, async ({ page, rec, act }) => {
  await applyOffCamera("Maria Santos (demo)", "0900 000 5678");
  await page.goto("/employer");
  await settle(page);
  await record(employer, "employer-applications", async () => {
    await sleep(700);
    const nav = page.getByRole("link", { name: /^Applications/ }).first();
    await rec.mark("nav", nav);
    await act.click(nav);
    await page.getByRole("heading", { name: "Applications" }).waitFor();
    await sleep(900);
    await act.click(page.getByRole("link", { name: "Juan Dela Cruz" }).first());
    await page.getByRole("heading", { name: "Juan Dela Cruz" }).waitFor();
    await sleep(800);
    const call = page.getByRole("link", { name: "Call", exact: true });
    await act.reveal(call, { at: 0.35, ms: 800 });
    await rec.mark("contact", call);
    await act.point(call);
    await sleep(600);
    await act.point(page.getByRole("link", { name: "Text", exact: true }));
    await sleep(700);
    const photo = page.getByRole("img", { name: /Sent by Juan Dela Cruz/ });
    await act.reveal(photo, { at: 0.3, ms: 800 });
    await rec.mark("photo", photo);
    await act.point(photo);
    await sleep(1000);
    const status = page.getByLabel("Status");
    await act.select(status, "interview");
    await act.click(page.getByRole("button", { name: "Save status" }));
    await page.getByText("Application status saved.").first().waitFor();
    await act.reveal(page.locator("h1").first(), { at: 0.1, ms: 600 });
    await sleep(1300);
  });
});

/* ------------------------- Applicant checks status ------------------------ */
await scene("visitor-status", visitor, async ({ page, rec, act }) => {
  if (!reference) throw new Error("visitor-status needs visitor-apply in the same run.");
  await page.goto(`/application-status?ref=${reference}`);
  await settle(page);
  await record(visitor, "visitor-status", async () => {
    await sleep(600);
    await act.type(page.getByLabel("Mobile number or email"), DEMO_MOBILE, 55);
    await act.click(page.getByRole("button", { name: "Check status" }));
    const result = page.getByRole("heading", { name: "For interview" });
    await result.waitFor();
    await act.reveal(result, { at: 0.25, ms: 700 });
    await rec.mark("result", result);
    await sleep(2200);
  });
});

/* ------------------------- Hire and close the job ------------------------- */
await scene("employer-hire", employer, async ({ page, rec, act }) => {
  await record(employer, "employer-hire", async () => {
    await sleep(500);
    await act.select(page.getByLabel("Status"), "hired");
    await act.click(page.getByRole("button", { name: "Save status" }));
    const filled = page.getByRole("heading", { name: "Position filled?" });
    await filled.waitFor();
    await act.reveal(filled, { at: 0.3, ms: 700 });
    await rec.mark("filled", filled);
    await act.point(page.getByRole("checkbox"));
    await sleep(1100);
    await act.click(page.getByRole("button", { name: "Close job" }));
    await page
      .getByText(/Closed jobs leave the listings/)
      .first()
      .waitFor();
    await act.reveal(page.locator("h1").first(), { at: 0.1, ms: 600 });
    await sleep(1500);
  });
});

await scene("reviewer-results", reviewer, async ({ page, rec, act }) => {
  await page.goto("/manage");
  await settle(page);
  await record(reviewer, "reviewer-results", async () => {
    await sleep(500);
    const results = page.locator('section[aria-labelledby="results-heading"]');
    await act.reveal(results, { at: 0.3, ms: 1100 });
    await rec.mark("results", results);
    await act.point(page.getByText(/hired through Trabaho Biñan/).first());
    await sleep(1800);
  });
});

/* ------------------------------ Administrator ----------------------------- */
await scene("admin-audit", admin, async ({ page, rec, act }) => {
  // Filtered to job events: other entries can contain people's email addresses.
  await page.goto("/manage/audit?type=job");
  await settle(page);
  await record(admin, "admin-audit", async () => {
    await sleep(1400);
    await rec.mark("list", page.locator("main ul, main ol").first());
    await act.scrollBy(touch ? 700 : 380, 1800);
    await sleep(1200);
  });
});

await scene("admin-settings", admin, async ({ page, rec, act }) => {
  await page.goto("/manage/settings");
  await settle(page);
  await record(admin, "admin-settings", async () => {
    await sleep(1300);
    await rec.mark("form", page.locator("main form").first());
    await act.point(page.locator('[name="operatorName"]'));
    await sleep(1300);
  });
});

await browser.close();
console.log("Done.");
