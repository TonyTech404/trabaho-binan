import { describe, expect, it } from "vitest";
import { slugify } from "~/lib/ids";
import { isCacheableRequest, publicCacheControl } from "~/lib/public-cache.server";
import { contentSecurityPolicy, isCrossSiteMutation } from "~/lib/security.server";
import { safeNextPath } from "~/lib/session.server";
import { toPrefixTsQuery } from "~/services/public-jobs.server";

const req = (
  method: string,
  headers: Record<string, string> = {},
  url = "https://trabaho.example/manage",
) => new Request(url, { method, headers });

describe("cross-site mutation guard", () => {
  it("allows safe methods and same-origin posts", () => {
    expect(isCrossSiteMutation(req("GET", { origin: "https://evil.example" }))).toBe(false);
    expect(
      isCrossSiteMutation(
        req("POST", { origin: "https://trabaho.example", "sec-fetch-site": "same-origin" }),
      ),
    ).toBe(false);
  });

  it("blocks cross-site posts", () => {
    expect(isCrossSiteMutation(req("POST", { origin: "https://evil.example" }))).toBe(true);
    expect(isCrossSiteMutation(req("POST", { "sec-fetch-site": "cross-site" }))).toBe(true);
  });
});

describe("public page caching rules", () => {
  it("caches only anonymous GETs of public paths", () => {
    expect(isCacheableRequest(req("GET", {}, "https://t.example/"), false)).toBe(true);
    expect(
      isCacheableRequest(req("GET", {}, "https://t.example/jobs/abc23456/cashier"), false),
    ).toBe(true);
    expect(
      isCacheableRequest(req("GET", {}, "https://t.example/jobs/abc23456/cashier"), true),
    ).toBe(false);
    expect(isCacheableRequest(req("GET", {}, "https://t.example/manage"), false)).toBe(false);
    expect(isCacheableRequest(req("GET", {}, "https://t.example/apply/abc23456"), false)).toBe(
      false,
    );
    expect(isCacheableRequest(req("POST", {}, "https://t.example/"), false)).toBe(false);
  });

  it("never caches beyond the deadline", () => {
    expect(publicCacheControl(60, 20)).toBe("public, max-age=0, s-maxage=20");
    expect(publicCacheControl(60, 0)).toBe("no-cache");
    expect(publicCacheControl(60, -5)).toBe("no-cache");
  });

  it("uses a nonce-based script policy and forbids framing", () => {
    const csp = contentSecurityPolicy("abc", true);
    expect(csp).toContain("script-src 'self' 'nonce-abc'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });
});

describe("helpers", () => {
  it("only redirects to same-site paths after sign-in", () => {
    expect(safeNextPath("/manage/jobs", "/")).toBe("/manage/jobs");
    expect(safeNextPath("//evil.example", "/")).toBe("/");
    expect(safeNextPath("https://evil.example", "/")).toBe("/");
    expect(safeNextPath("/\\evil.example", "/")).toBe("/");
  });

  it("builds prefix text-search queries from free text", () => {
    expect(toPrefixTsQuery("Cash  serv!")).toBe("cash:* & serv:*");
    expect(toPrefixTsQuery("'); drop table jobs; --")).toBe("drop:* & table:* & jobs:*");
    expect(toPrefixTsQuery("   ")).toBeNull();
  });

  it("makes readable ASCII slugs", () => {
    expect(slugify("Kusinero / Cook — Biñan Branch")).toBe("kusinero-cook-binan-branch");
    expect(slugify("!!!")).toBe("job");
  });
});
