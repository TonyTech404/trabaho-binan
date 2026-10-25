import { describe, expect, it } from "vitest";
import { isGuessablePassword } from "~/lib/auth-forms.server";
import { describeError, loggablePath } from "~/lib/log.server";
import { clientNetwork, coarseNetwork } from "~/lib/rate-limit.server";
import { bodyLimitResponse } from "~/lib/security.server";
import { safeNextPath } from "~/lib/session.server";

describe("redirect after sign-in", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/manage/jobs?status=paused", "/")).toBe("/manage/jobs?status=paused");
    expect(safeNextPath("/employer#applications", "/")).toBe("/employer#applications");
  });

  it("refuses anything that browsers would send to another site", () => {
    for (const next of [
      "https://evil.example/",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/ /evil.example",
      "javascript:alert(1)",
      "",
      null,
    ]) {
      expect(safeNextPath(next, "/fallback")).toBe("/fallback");
    }
  });
});

describe("guessable passwords", () => {
  it("refuses common passwords and this site's own names, with digits or symbols added", () => {
    for (const pw of [
      "password123",
      "Password2026!",
      "Trabaho@12345",
      "pesobinan2026",
      "1234567890",
      "0987654321",
      "aaaaaaaaaaaa",
      "09171234567",
      "Biñan123456",
    ]) {
      expect(isGuessablePassword(pw), pw).toBe(true);
    }
  });

  it("accepts ordinary passphrases", () => {
    for (const pw of ["correct-horse-battery", "kape at pandesal 7am", "MyBakery2026!sale"]) {
      expect(isGuessablePassword(pw), pw).toBe(false);
    }
  });
});

describe("rate-limit networks", () => {
  it("counts IPv4 addresses one by one and IPv6 by /64", () => {
    expect(clientNetwork("203.0.113.7")).toBe("203.0.113.7");
    expect(clientNetwork("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(clientNetwork("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
    expect(clientNetwork("2001:0db8:0001::")).toBe("2001:db8:1:0::/64");
  });

  it("logs only a coarse network", () => {
    expect(coarseNetwork("203.0.113.7")).toBe("203.0.113.0/24");
    expect(coarseNetwork("2001:db8:1:2::9")).toBe("2001:db8:1::/48");
    expect(coarseNetwork("garbage")).toBe("unknown");
  });
});

describe("log-safe errors", () => {
  it("keeps only the Postgres code for database errors, never the query values", () => {
    const cause = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      constraint: "applications_reference_unique",
    });
    const error = new Error(
      'Failed query: insert into "applications" ...\nparams: Juan Dela Cruz,+639171234567,my-secret-password',
      { cause },
    );
    error.name = "DrizzleQueryError";
    const logged = JSON.stringify(describeError(error));
    expect(logged).toContain("23505");
    expect(logged).toContain("applications_reference_unique");
    expect(logged).not.toContain("Juan");
    expect(logged).not.toContain("+639171234567");
    expect(logged).not.toContain("my-secret-password");
  });

  it("masks account-link tokens in paths", () => {
    const token = "a".repeat(43);
    expect(loggablePath(`https://x.test/invite/${token}?a=1`)).toBe("/invite/:token");
    expect(loggablePath("https://x.test/jobs/k8btdz6c/cashier")).toBe("/jobs/k8btdz6c/cashier");
  });
});

describe("request size limits", () => {
  const post = (path: string, length: string | null, body: string | null = "x") =>
    new Request(`https://x.test${path}`, {
      method: "POST",
      body,
      headers: length === null ? {} : { "content-length": length },
    });

  it("allows uploads up to the application limit, text forms up to 256 KB", () => {
    expect(bodyLimitResponse(post("/apply/abc123/form", String(10 * 1024 * 1024)))).toBeNull();
    expect(bodyLimitResponse(post("/apply/abc123/form", String(20 * 1024 * 1024)))?.status).toBe(
      413,
    );
    expect(bodyLimitResponse(post("/login", String(300 * 1024)))?.status).toBe(413);
    expect(bodyLimitResponse(post("/login", "120"))).toBeNull();
    expect(bodyLimitResponse(new Request("https://x.test/", { method: "GET" }))).toBeNull();
  });
});
