<!-- SPDX-License-Identifier: Apache-2.0 -->
# khushu-engine API

Status: skeleton (version 0.1.0). All times are Unix epoch milliseconds.

| Call | Today | Later |
| --- | --- | --- |
| `ping(): string` | Returns the engine version (sync). | Same. |
| `formatTime(at: number, withSeconds?: boolean): string` | Time text in the phone's 12/24-hour setting and language (sync). The notification's `{until}` uses it. | Same. |
| `setPlan(plan: Plan): Promise<void>` | Validates in JS (rejects with `Invalid plan: …`), saves it, arms one exact alarm per future window (`setWindow` fallback plus a Doze-exempt backup) and silences at once if a window is open. | Same. |
| `setFences(fences: Fence[]): Promise<void>` | Validates in JS (rejects with `Invalid fences: …`), then keeps the fences in memory. | Registers geofences. |
| `getStatus(): Promise<Status>` | `idle`, `armed` or `silenced`; restores first if a silence has run out. | Same. |
| `startManual(durationMinutes: number): Promise<void>` | Rejects with `Invalid duration: …` unless 0 < minutes ≤ 1440. Silences now with our own Do Not Disturb rule and restores after the duration; rejects with `POLICY_ACCESS_DENIED` without access (Android 11+ only). | Same. |
| `stopSilence(): Promise<void>` | Restores sound now, removes the notice and cancels the end alarm. | Same. |
| `getHistory(): Promise<HistoryEvent[]>` | The last 300 events, oldest first (`detail` holds `key=value` facts such as `delta_ms` and `activation_ms`). | Same. |
| `getDiagnostics(): Promise<Diagnostics>` | Version, SDK level, counts, last alarm time and real permission states. | Plus last fence event and fix time. |
| `checkPermissions(): Promise<PermissionState>` | Real, read-only checks. | Same. |
| `openPermissionSettings(kind: PermissionKind): Promise<void>` | Opens the matching system settings screen. | Same. |
| `addStatusChangedListener(fn: (s: Status) => void): EventSubscription` | Fires on every state change while the app is open (`statusChanged` event). | Same. |

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
