import { describe, expect, it } from "vitest";
import { addUtcDays } from "./index";

describe("addUtcDays", () => {
  it("adds days and crosses a month boundary", () => {
    expect(addUtcDays("2026-01-30", 3)).toBe("2026-02-02");
  });

  it("accepts a negative offset and rejects a bad date", () => {
    expect(addUtcDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(() => addUtcDays("2026/01/30", 1)).toThrow(/YYYY-MM-DD/);
  });
});
