// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

import type { EventSubscription } from "expo";

import native from "./KhushuEngineModule";
import type {
  Diagnostics,
  Fence,
  HistoryEvent,
  PermissionKind,
  PermissionState,
  Plan,
  Status,
} from "./KhushuEngine.types";
import { validateFences, validateManualDuration, validatePlan } from "./plan";

export * from "./KhushuEngine.types";
export {
  formatNoticeBody,
  MAX_MANUAL_MINUTES,
  UNTIL_PLACEHOLDER,
  validateFences,
  validateManualDuration,
  validatePlan,
} from "./plan";

/** Returns the engine version. Used as a smoke test that the native module is linked. */
export function ping(): string {
  return native.ping();
}

/** Replaces the whole plan (rule name, notice text and time windows). */
export async function setPlan(plan: Plan): Promise<void> {
  const problems = validatePlan(plan);
  if (problems.length > 0) throw new Error(`Invalid plan: ${problems.join("; ")}`);
  await native.setPlan(plan);
}

/** Replaces the whole set of fences. */
export async function setFences(fences: Fence[]): Promise<void> {
  const problems = validateFences(fences);
  if (problems.length > 0) throw new Error(`Invalid fences: ${problems.join("; ")}`);
  await native.setFences(fences);
}

export function getStatus(): Promise<Status> {
  return native.getStatus();
}

/** Silences now for a fixed number of minutes, then restores. */
export async function startManual(durationMinutes: number): Promise<void> {
  const problems = validateManualDuration(durationMinutes);
  if (problems.length > 0) throw new Error(`Invalid duration: ${problems.join("; ")}`);
  await native.startManual(durationMinutes);
}

/** Restores sound now and ends any active silence. */
export function stopSilence(): Promise<void> {
  return native.stopSilence();
}

export function getHistory(): Promise<HistoryEvent[]> {
  return native.getHistory();
}

export function getDiagnostics(): Promise<Diagnostics> {
  return native.getDiagnostics();
}

export function checkPermissions(): Promise<PermissionState> {
  return native.checkPermissions();
}

export function openPermissionSettings(kind: PermissionKind): Promise<void> {
  return native.openPermissionSettings(kind);
}

/** Subscribes to status changes. Call `remove()` on the result to stop. */
export function addStatusChangedListener(listener: (status: Status) => void): EventSubscription {
  return native.addListener("statusChanged", listener);
}
