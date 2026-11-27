// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Khushu contributors

/**
 * Public types of the engine. They live inside the engine on purpose: host
 * apps may import or mirror them, but the engine never imports app types.
 * All times are Unix epoch milliseconds.
 */

/** A circular place. Silence applies only while the device is inside it. */
export type Fence = {
  id: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

/** A time window during which the device should be silent inside its fences. */
export type TimeWindow = {
  id: string;
  startsAt: number;
  endsAt: number;
  /** Fence ids this window applies to. */
  fenceIds: string[];
};

/** Text for the ongoing notification shown while silenced. Supplied by the host app. */
export type Notice = {
  title: string;
  /** May contain the `{until}` placeholder, replaced with the restore time. */
  body: string;
};

/** Everything the engine needs to run, replaced as a whole by `setPlan`. */
export type Plan = {
  /** Name of the Do Not Disturb rule shown in system settings. */
  ruleName: string;
  notice: Notice;
  /** Label of the action that restores sound immediately. */
  unmuteLabel: string;
  windows: TimeWindow[];
};

export type SilenceState = "idle" | "armed" | "silenced";

export type SilenceReason = "window" | "manual";

export type Status = {
  state: SilenceState;
  reason: SilenceReason | null;
  activeWindowId: string | null;
  /** When sound comes back, if silenced. */
  silencedUntil: number | null;
  updatedAt: number;
};

export type HistoryEventType =
  | "armed"
  | "window_open"
  | "window_close"
  | "fence_enter"
  | "fence_exit"
  | "silenced"
  | "restored"
  | "manual_start"
  | "manual_stop"
  | "boot"
  | "error";

export type HistoryEvent = {
  at: number;
  type: HistoryEventType;
  windowId: string | null;
  detail: string | null;
};

export type PermissionStatus = "granted" | "denied" | "not_applicable";

export type PermissionState = {
  notifications: PermissionStatus;
  notificationPolicy: PermissionStatus;
  exactAlarm: PermissionStatus;
  fineLocation: PermissionStatus;
  backgroundLocation: PermissionStatus;
};

export type PermissionKind = keyof PermissionState;

export type Diagnostics = {
  engineVersion: string;
  platformSdk: number;
  windowCount: number;
  fenceCount: number;
  lastFenceEventAt: number | null;
  lastAlarmAt: number | null;
  lastFixAt: number | null;
  permissions: PermissionState;
};

export type KhushuEngineEvents = {
  statusChanged: (status: Status) => void;
};
