import { describe, expect, it } from "vitest";
import { isNonEmptyString } from "./index";

describe("isNonEmptyString", () => {
  it("accepts a string with visible characters", () => {
    expect(isNonEmptyString("ok")).toBe(true);
  });

  it("rejects blank strings and non-strings", () => {
    expect(isNonEmptyString("   ")).toBe(false);
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonEmptyString(1)).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
  });
});
