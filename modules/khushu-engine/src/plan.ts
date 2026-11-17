// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

import type { Fence, Plan } from "./KhushuEngine.types";

/** The placeholder a notice body may use for the restore time. */
export const UNTIL_PLACEHOLDER = "{until}";

/** Returns a list of problems with a plan; empty means the plan is valid. */
export function validatePlan(plan: Plan): string[] {
  const problems: string[] = [];
  if (plan.ruleName.trim() === "") problems.push("ruleName is empty");
  if (plan.notice.title.trim() === "") problems.push("notice.title is empty");
  if (plan.notice.body.trim() === "") problems.push("notice.body is empty");
  if (plan.unmuteLabel.trim() === "") problems.push("unmuteLabel is empty");

  const ids = new Set<string>();
  for (const w of plan.windows) {
    if (w.id.trim() === "") problems.push("a window has an empty id");
    if (ids.has(w.id)) problems.push(`window ${w.id} is duplicated`);
    ids.add(w.id);
    if (!Number.isFinite(w.startsAt) || !Number.isFinite(w.endsAt)) {
      problems.push(`window ${w.id} has a non-finite time`);
    } else if (w.endsAt <= w.startsAt) {
      problems.push(`window ${w.id} ends before it starts`);
    }
  }
  return problems;
}

/** Returns a list of problems with a set of fences; empty means valid. */
export function validateFences(fences: Fence[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const f of fences) {
    if (f.id.trim() === "") problems.push("a fence has an empty id");
    if (ids.has(f.id)) problems.push(`fence ${f.id} is duplicated`);
    ids.add(f.id);
    if (!(f.latitude >= -90 && f.latitude <= 90)) problems.push(`fence ${f.id} has a bad latitude`);
    if (!(f.longitude >= -180 && f.longitude <= 180)) problems.push(`fence ${f.id} has a bad longitude`);
    if (!(Number.isFinite(f.radiusMeters) && f.radiusMeters > 0)) problems.push(`fence ${f.id} has a bad radius`);
  }
  return problems;
}

/** Longest manual session, in minutes. */
export const MAX_MANUAL_MINUTES = 24 * 60;

/** Returns a list of problems with a manual session length; empty means valid. */
export function validateManualDuration(durationMinutes: number): string[] {
  return Number.isFinite(durationMinutes) && durationMinutes > 0 && durationMinutes <= MAX_MANUAL_MINUTES
    ? []
    : [`durationMinutes must be a number above 0 and at most ${MAX_MANUAL_MINUTES}`];
}

/** Fills the `{until}` placeholder in a notice body. */
export function formatNoticeBody(body: string, until: string): string {
  return body.split(UNTIL_PLACEHOLDER).join(until);
}
