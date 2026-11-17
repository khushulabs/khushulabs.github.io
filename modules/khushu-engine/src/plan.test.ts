// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

import { describe, expect, it } from "vitest";

import type { Plan } from "./KhushuEngine.types";
import { formatNoticeBody, validateFences, validateManualDuration, validatePlan } from "./plan";

const plan: Plan = {
  ruleName: "Quiet time",
  notice: { title: "Silenced", body: "Back on at {until}" },
  unmuteLabel: "Unmute now",
  windows: [{ id: "w1", startsAt: 1_000, endsAt: 2_000, fenceIds: ["f1"] }],
};

describe("validatePlan", () => {
  it("accepts a good plan", () => {
    expect(validatePlan(plan)).toEqual([]);
  });

  it("rejects empty text, duplicate ids and backwards windows", () => {
    const bad: Plan = {
      ...plan,
      ruleName: " ",
      windows: [
        { id: "w1", startsAt: 2_000, endsAt: 1_000, fenceIds: [] },
        { id: "w1", startsAt: 1_000, endsAt: 2_000, fenceIds: [] },
      ],
    };
    expect(validatePlan(bad)).toEqual([
      "ruleName is empty",
      "window w1 ends before it starts",
      "window w1 is duplicated",
    ]);
  });
});

describe("validateFences", () => {
  it("accepts a good fence and rejects a bad radius", () => {
    expect(validateFences([{ id: "f1", latitude: 23.8, longitude: 90.4, radiusMeters: 100 }])).toEqual([]);
    expect(validateFences([{ id: "f2", latitude: 91, longitude: 0, radiusMeters: 0 }])).toEqual([
      "fence f2 has a bad latitude",
      "fence f2 has a bad radius",
    ]);
  });
});

describe("validation edge cases", () => {
  it("rejects blank ids and an infinite radius", () => {
    expect(validateFences([{ id: " ", latitude: 0, longitude: 0, radiusMeters: Infinity }])).toEqual([
      "a fence has an empty id",
      "fence   has a bad radius",
    ]);
    expect(validatePlan({ ...plan, windows: [{ id: " ", startsAt: 1, endsAt: 2, fenceIds: [] }] })).toEqual([
      "a window has an empty id",
    ]);
  });

  it("checks manual session length", () => {
    expect(validateManualDuration(15)).toEqual([]);
    for (const bad of [0, -5, Number.NaN, Infinity, 24 * 60 + 1]) {
      expect(validateManualDuration(bad)).toHaveLength(1);
    }
  });
});

describe("formatNoticeBody", () => {
  it("fills every {until} placeholder", () => {
    expect(formatNoticeBody("Back on at {until} ({until})", "1:45")).toBe("Back on at 1:45 (1:45)");
  });
});
