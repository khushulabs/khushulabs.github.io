// SPDX-License-Identifier: GPL-3.0-or-later
import type { HistoryEvent } from "khushu-engine";
import { describe, expect, it } from "vitest";

import { detailNumber, summariseAlarms } from "./spikeLog";

const ev = (type: HistoryEvent["type"], detail: string | null, at = 1000): HistoryEvent => ({
  at,
  type,
  windowId: "w",
  detail,
});

describe("spike log", () => {
  it("reads numbers from the detail text", () => {
    expect(detailNumber(ev("window_open", "delta_ms=-120 mode=exact"), "delta_ms")).toBe(-120);
    expect(detailNumber(ev("window_open", "mode=exact"), "delta_ms")).toBeNull();
    expect(detailNumber(ev("silenced", "activation_ms=80"), "ms")).toBeNull();
  });

  it("counts on-time alarms and the slowest activation", () => {
    const events = [
      ev("window_open", "delta_ms=300 mode=exact"),
      ev("silenced", "activation_ms=90 observed=true"),
      ev("window_open", "delta_ms=70000 mode=window"),
      ev("silenced", "activation_ms=450 observed=true"),
      ev("window_open", "delta_ms=5 mode=exact", 10),
    ];
    expect(summariseAlarms(events, 60_000, 500)).toEqual({
      fired: 2,
      onTime: 1,
      worstMs: 70000,
      slowestActivationMs: 450,
    });
  });
});
