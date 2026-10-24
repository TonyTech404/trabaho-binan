import { describe, expect, it } from "vitest";
import { addDaysToDateString, manilaDateString } from "~/lib/time";
import {
  cleanText,
  fieldErrors,
  httpsUrl,
  jobInputSchema,
  MAX_LISTING_DAYS,
} from "~/lib/validation";

const now = new Date("2026-10-24T03:00:00Z"); // 11:00 in Manila
const today = manilaDateString(now);

const valid = {
  title: "Cashier",
  description: "Handle payments and help customers at the counter.",
  educationLevel: "high_school",
  experienceLevel: "none",
  employmentType: "full_time",
  workSetup: "on_site",
  workCity: "Biñan",
  applicationEmail: "HR@Example.com",
  deadline: addDaysToDateString(today, 10),
};

const parse = (input: Record<string, unknown>) => jobInputSchema({ now }).safeParse(input);

describe("job input validation", () => {
  it("accepts a complete listing and normalises values", () => {
    const result = parse({ ...valid, salaryMin: "₱18,000", salaryPeriod: "month", openings: "" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.applicationEmail).toBe("hr@example.com");
    expect(result.data.salaryMin).toBe(18000);
    expect(result.data.openings).toBeNull();
    expect(result.data.deadlineAt.toISOString()).toBe(
      `${addDaysToDateString(today, 10)}T15:59:59.999Z`,
    );
  });

  it("requires at least one way to apply", () => {
    const result = parse({ ...valid, applicationEmail: "" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(fieldErrors(result.error).applicationMethod).toMatch(/at least one way to apply/);
  });

  it("only accepts https application links without credentials", () => {
    expect(httpsUrl.safeParse("http://example.com/apply").success).toBe(false);
    expect(httpsUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpsUrl.safeParse("https://user:pass@example.com").success).toBe(false);
    expect(httpsUrl.safeParse("https://localhost/apply").success).toBe(false);
    expect(httpsUrl.parse("https://example.com/apply")).toBe("https://example.com/apply");
  });

  it("never invents a salary period without a salary, and requires one with a salary", () => {
    const noSalary = parse({ ...valid, salaryPeriod: "month" });
    expect(noSalary.success && noSalary.data.salaryPeriod).toBeNull();
    expect(parse({ ...valid, salaryMin: "500" }).success).toBe(false);
  });

  it("rejects a minimum salary above the maximum", () => {
    const result = parse({ ...valid, salaryMin: "900", salaryMax: "500", salaryPeriod: "day" });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).salaryMax).toBeDefined();
  });

  it("bounds the deadline between today and the maximum listing length", () => {
    expect(parse({ ...valid, deadline: addDaysToDateString(today, -1) }).success).toBe(false);
    expect(parse({ ...valid, deadline: today }).success).toBe(true);
    expect(
      parse({ ...valid, deadline: addDaysToDateString(today, MAX_LISTING_DAYS) }).success,
    ).toBe(true);
    expect(
      parse({ ...valid, deadline: addDaysToDateString(today, MAX_LISTING_DAYS + 1) }).success,
    ).toBe(false);
  });

  it("reports friendly messages for missing required fields", () => {
    const result = parse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = fieldErrors(result.error);
    expect(errors.title).toMatch(/at least 3 characters/);
    expect(errors.employmentType).toMatch(/Choose/);
    expect(errors.deadline).toMatch(/Choose a deadline/);
  });

  it("strips control characters and collapses blank lines", () => {
    expect(cleanText("  Line one\r\n\n\n\nLine\u0000 two \t\n")).toBe("Line one\n\nLine two");
  });
});
