// SPDX-License-Identifier: GPL-3.0-or-later
import type { HistoryEvent } from "khushu-engine";

/** Reads `key=value` facts from an event's detail text. */
export function detailNumber(event: HistoryEvent, key: string): number | null {
  const match = new RegExp(`(?:^| )${key}=(-?\\d+)`).exec(event.detail ?? "");
  return match?.[1] === undefined ? null : Number(match[1]);
}

export type AlarmSummary = {
  /** Window-open alarms seen so far. */
  fired: number;
  /** Of those, how many fired within `toleranceMs` of their scheduled time. */
  onTime: number;
  /** Worst absolute delay in ms. */
  worstMs: number;
  /** Slowest rule activation in ms. */
  slowestActivationMs: number;
};

/** Scores the alarm test: how many window-open alarms were on time. */
export function summariseAlarms(events: HistoryEvent[], toleranceMs: number, sinceMs = 0): AlarmSummary {
  let fired = 0;
  let onTime = 0;
  let worstMs = 0;
  let slowestActivationMs = 0;
  for (const e of events) {
    if (e.at < sinceMs) continue;
    if (e.type === "window_open") {
      const delta = detailNumber(e, "delta_ms");
      if (delta === null) continue;
      fired += 1;
      if (Math.abs(delta) <= toleranceMs) onTime += 1;
      worstMs = Math.max(worstMs, Math.abs(delta));
    } else if (e.type === "silenced") {
      slowestActivationMs = Math.max(slowestActivationMs, detailNumber(e, "activation_ms") ?? 0);
    }
  }
  return { fired, onTime, worstMs, slowestActivationMs };
}
