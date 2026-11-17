<!-- SPDX-License-Identifier: Apache-2.0 -->
# khushu-engine API

Status: skeleton (version 0.1.0). All times are Unix epoch milliseconds.

| Call | Today | Later |
| --- | --- | --- |
| `ping(): string` | Returns the engine version (sync). | Same. |
| `setPlan(plan: Plan): Promise<void>` | Validates in JS (rejects with `Invalid plan: …`), then keeps the plan in memory. | Persists it and arms alarms per window. |
| `setFences(fences: Fence[]): Promise<void>` | Validates in JS (rejects with `Invalid fences: …`), then keeps the fences in memory. | Registers geofences. |
| `getStatus(): Promise<Status>` | Always `idle`. | Current state from the reducer. |
| `startManual(durationMinutes: number): Promise<void>` | Rejects with `Invalid duration: …` unless 0 < minutes ≤ 1440, otherwise with `NOT_IMPLEMENTED`. | Silences now and restores after the duration. |
| `stopSilence(): Promise<void>` | Resolves (nothing is ever silenced yet). | Restores sound and ends the session. |
| `getHistory(): Promise<HistoryEvent[]>` | Empty list. | The last 30 events. |
| `getDiagnostics(): Promise<Diagnostics>` | Version, SDK level, counts and real permission states. | Plus last fence event, alarm and fix times. |
| `checkPermissions(): Promise<PermissionState>` | Real, read-only checks. | Same. |
| `openPermissionSettings(kind: PermissionKind): Promise<void>` | Rejects with `NOT_IMPLEMENTED`. | Opens the matching system settings screen. |
| `addStatusChangedListener(fn: (s: Status) => void): EventSubscription` | Never fires yet. | Fires on every state change (`statusChanged` event). |

## Types

The full type definitions are in [`src/KhushuEngine.types.ts`](../src/KhushuEngine.types.ts): `Plan`, `TimeWindow`, `Notice`, `Fence`, `Status` (`state`: `idle` | `armed` | `silenced`), `HistoryEvent`, `Diagnostics`, `PermissionState`, `PermissionStatus` and `PermissionKind`. The pure checks (`validatePlan`, `validateFences`, `validateManualDuration`) and `formatNoticeBody` are exported too.

## Plan

```ts
type Plan = {
  ruleName: string;                         // Do Not Disturb rule name shown in system settings
  notice: { title: string; body: string };  // body may contain {until}
  unmuteLabel: string;                      // label of the "restore now" action
  windows: { id: string; startsAt: number; endsAt: number; fenceIds: string[] }[];
};
```

The engine ships only neutral defaults in `android/src/main/res/values/strings.xml` ("Silenced", "Back on at {until}", "Unmute now"). Any domain wording comes from the host app through `setPlan()`.

## Permissions added by the config plugin

`RECEIVE_BOOT_COMPLETED`, `ACCESS_NOTIFICATION_POLICY`, `SCHEDULE_EXACT_ALARM` (never `USE_EXACT_ALARM`), `POST_NOTIFICATIONS`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, plus a non-exported `BootReceiver` for `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED`.

The plugin also blocks `USE_EXACT_ALARM` (`tools:node="remove"`), so no dependency can merge it into the host app.
