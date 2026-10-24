import { describe, expect, it } from "vitest";
import { findPolicyFlags } from "~/lib/policy-flags";

const labels = (...t: string[]) => findPolicyFlags(...t).map((f) => f.label);

describe("policy wording flags", () => {
  it("flags age requirements", () => {
    expect(labels("Applicants must be 18-35 years old")).toContain("Age requirement");
    expect(labels("Age limit: 30")).toContain("Age requirement");
    expect(labels("Not older than 40")).toContain("Age requirement");
  });

  it("flags gender, marital status, appearance and religion requirements", () => {
    expect(labels("Female only")).toContain("Gender requirement");
    expect(labels("Must be single")).toContain("Marital status");
    expect(labels("With pleasing personality")).toContain("Physical appearance");
    expect(labels("Height 5'4\" and above")).toContain("Physical appearance");
    expect(labels("Catholic applicants preferred")).toContain("Religion");
  });

  it("flags fees charged to applicants", () => {
    expect(labels("A training fee of 1,500 is required")).toContain("Fee charged to applicants");
    expect(labels("Pay a fee before orientation")).toContain("Fee charged to applicants");
  });

  it("does not flag ordinary job wording", () => {
    expect(
      labels("Handle cash, serve customers, 3 years experience in retail. Single shift only."),
    ).toEqual([]);
  });
});
