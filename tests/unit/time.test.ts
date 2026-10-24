import { describe, expect, it } from "vitest";
import {
  addDaysToDateString,
  daysUntil,
  describeDeadline,
  endOfManilaDay,
  manilaDateString,
} from "~/lib/time";

describe("Manila time helpers", () => {
  it("uses the Manila calendar day, not UTC", () => {
    expect(manilaDateString(new Date("2026-10-24T16:30:00Z"))).toBe("2026-10-25"); // 00:30 next day in Manila
    expect(manilaDateString(new Date("2026-10-24T15:59:59Z"))).toBe("2026-10-24");
  });

  it("ends a deadline day at 23:59:59.999 Manila time", () => {
    expect(endOfManilaDay("2026-10-31").toISOString()).toBe("2026-10-31T15:59:59.999Z");
    expect(() => endOfManilaDay("31/10/2026")).toThrow();
  });

  it("counts calendar days until the deadline", () => {
    const now = new Date("2026-10-24T02:00:00Z");
    expect(daysUntil(endOfManilaDay("2026-10-24"), now)).toBe(0);
    expect(daysUntil(endOfManilaDay("2026-10-27"), now)).toBe(3);
    expect(describeDeadline(endOfManilaDay("2026-10-24"), now)).toBe("Closes today");
    expect(describeDeadline(endOfManilaDay("2026-10-25"), now)).toBe("Closes tomorrow");
    expect(describeDeadline(new Date("2026-10-23T00:00:00Z"), now)).toBe("Closed");
  });

  it("adds days across month ends", () => {
    expect(addDaysToDateString("2026-10-30", 3)).toBe("2026-11-02");
  });
});
