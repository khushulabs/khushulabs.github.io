# Spike S-A (KH-001): AutomaticZenRule and exact alarm

Status: **build ready, waiting for the on-phone run.** Tick the boxes below as you test, then fill in the result table and add the video.

## What this proves

Our own Do Not Disturb rule turns on and off, the user's own Do Not Disturb setting stays untouched, starred contacts still ring, exact alarms are on time, and the fallback works when exact alarms are not allowed.

## GO criteria (plan §5)

- [ ] **G1** The rule turns on in under 2 s (on every phone tested).
- [ ] **G2** Turning our rule off leaves the user's own Do Not Disturb **unchanged**.
- [ ] **G3** A starred caller rings while our rule is on.
- [ ] **G4** Exact alarms fire within ±1 min, **20 of 20** times.
- [ ] **G5** With exact alarms revoked, the `setWindow` fallback fires within ±3 min.
- [ ] **G6** The release manifest has no `USE_EXACT_ALARM` (checked in the build, see below).

Extra checks (not in the plan's GO list, but they decide whether S-A is usable):

- [ ] **E1** "Unmute now" (notification and in-app) restores sound at once.
- [ ] **E2** A reboot during a silence re-arms it, and sound is restored at the end time.
- [ ] **E3** A silence that was scheduled from a locked, idle phone still fires (Doze).
- [ ] **E4** Revoking exact alarms during a silence still restores sound (T7 step 4).

## Setup

1. Install `khushu-spike-sa-debug.apk` on the phone. Allow "install unknown apps" if asked.
2. Open the app. Tap **Grant** next to each of the three permissions:
   - Notifications: tap Allow.
   - Do Not Disturb access: switch **Khushu** on.
   - Alarms & reminders: switch **Allow** on.
3. Note your own Do Not Disturb state first (swipe down, look at the Do Not Disturb tile). Leave it **off** for the first run. Repeat G2 once with it **on** if you want an extra check.
4. Phone: Moto Edge 40 Neo, Android 13+. The Xiaomi/Redmi run happens later (KH-002), with battery saving off for the app.
5. Start every run with your **own** Do Not Disturb **off**. Then `observed=true` in the log is meaningful for G1.
6. Installing a newer build over this one keeps the app's data. If a silence looks stuck, open the app: it restores sound on open.

The app's log lines show the facts to copy into the result table: `delta_ms` (how late an alarm fired), `activation_ms` (how long the rule took to turn on), and `dnd_before` / `dnd_after` (your own setting, before and after).

## Test steps

**T1 · Scheduled silence (G1, G4 for one alarm)**
1. Tap **Silence in 2 min for 3 min**. Status says `armed`.
2. Wait. After 2 min the status says `silenced`, a notification "Silenced for Khushu spike, back on at HH:MM" appears, and the phone goes quiet.
3. After 3 more minutes the notification goes away and sound is back.
4. Read the log: `window_open … delta_ms=…` (G4) and `silenced … activation_ms=…` (G1).

**T2 · Unmute now (E1, G2)**
1. Tap **Silence now for 2 min**. Status says `silenced`.
2. Pull down the notification and tap **Unmute now**. Repeat once with the in-app **Unmute now** button.
3. Sound is back at once. The log line `restored … dnd_before=… dnd_after=… unchanged=true` proves G2. Also look at the Do Not Disturb tile: it is in the state you noted.

**T3 · Starred contact rings (G3)**
1. Star a contact in your Contacts app. Ask them (or use a second phone) to call you.
2. Tap **Silence now for 2 min**. Have the starred contact call you: it should **ring**.
3. Have a **non-starred** number call: it should **not** ring. A second call from that number within 15 minutes should ring (repeat caller).
4. Tap **Unmute now** afterwards.

**T4 · 20 alarms (G4)**
1. Tap **20-alarm test**. It schedules 20 silences of 30 s, one a minute, starting in 2 min (about 22 min in all).
2. Leave the app alone. You may lock the screen.
3. When it is done, the app shows `x/20 on time (±1 min)`. Write down `x` and the worst delay. G4 is met only at 20/20.

**T5 · Reboot during a silence (E2)**
1. Tap **Silence in 2 min for 3 min**. When the status says `silenced`, restart the phone.
2. After the restart, unlock the phone and wait. Without opening the app, sound should be back by the end time (the log line `boot` and then `restored` appear when you open the app).
3. If the restart happens before the silence starts, the silence should still begin at the planned time.

**T6 · Doze / idle (E3)**
1. Tap **Silence in 45 min for 3 min (Doze test)**. Lock the phone, unplug it, and leave it flat and untouched for the full 45 min.
2. At the start time the phone should go quiet (check the log: `delta_ms` should be within ±1 min), then restore 3 min later.
3. Note: Android only enters deep Doze if the phone is still and unplugged for a long time, and the Moto may not enter it. Write down what you saw. A stronger test with a laptop (`adb shell dumpsys deviceidle force-idle`) can be done later.

**T7 · Fallback without exact alarms (G5)**
1. Phone Settings → Apps → Special app access → Alarms & reminders → Khushu → turn **off**. (The app closes.)
2. Open the app: "Alarms & reminders" says denied. Tap **Silence in 2 min for 3 min**.
3. The log line `armed … mode=window` shows the fallback. Wait: it should silence within ±3 min of the planned time (`delta_ms`, `mode=window`, or `mode=window-backup` if Doze held the first alarm back) and restore within a few minutes after the end.
4. Revoke while silenced: turn the permission back on, tap **Silence now for 2 min**, then turn it off again straight away and leave the app closed. Leave it: the safety alarm must still restore sound within about 30 s of the end time.
5. Turn the permission back on. The log shows a `boot … SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED` line, and later schedules use `mode=exact`.

**T8 · Our rule only (G2)**
1. With the phone's own Do Not Disturb **on** (for example "Priority only"), run T2 once.
2. `dnd_before` and `dnd_after` must be the same, and the Do Not Disturb tile must still be on afterwards. In Settings → Do Not Disturb → Schedules you will see a rule called "Khushu spike": that is ours.

**Known limits to note, not to fix:** after Settings → Force stop, all alarms are gone and the rule can stay on until the app is opened. Test it once and write down what you see. If the 20-alarm test runs with the screen off, note any alarm more than 1 min late and when you last opened the app (the system may throttle idle apps).

## Result table (Moto Edge 40 Neo, 18–27 Nov 2026, build v3 bb5567c)

| Check | Result | Notes (values from the log) |
| --- | --- | --- |
| G1 rule on < 2 s | pass (Moto) | `activation_ms` = 8–91, worst 858 (one of 20) |
| G2 own setting unchanged | pass (Moto, Realme) | `dnd_before` / `dnd_after` = ALL / ALL, `unchanged=true` on every run |
| G3 starred caller rings | pass (Moto) | repeat caller also rang |
| G4 exact alarms 20/20 within ±1 min | pass (Moto) | 20/20, worst delay = 1.67 s |
| G5 fallback within ±3 min | not run (optional) | |
| G6 no `USE_EXACT_ALARM` | pass | see "Build checks" |
| E1 Unmute now | pass (Moto) | from the notification and from the app |
| E2 reboot | pass (Moto) | reboot mid-silence, restored on time (`delta_ms`=31) without opening the app |
| E3 Doze | pass (Moto) | 45 min idle, `delta_ms`=15; deep Doze entry not confirmed (no adb) |
| E4 revoke during a silence | not run (optional) | |

**Verdict:** GO on the Moto (near-stock Android). Realme GT (ColorOS), one run: silenced on time via the backup path and restored ~3 s late, but the exact start alarm itself arrived 183 s late and logged a harmless "window already over" error. Follow-ups: log that case as info, not error; retest Realme with the app swiped from recents; Xiaomi/Redmi in KH-002. If NO-GO on this phone: fall back to `setInterruptionFilter` on that OEM, or ship reminder mode only there (plan §5).

## Video

Not recorded (decided with Md, 19 Nov 2026): a screen recording would exceed GitHub's attachment limit and adds nothing the logs don't prove. The device logs are the evidence.

## How it works (for review)

- One AutomaticZenRule named after `Plan.ruleName`, owned by a do-nothing condition service. Policy: calls from starred contacts and repeat callers allowed, alarms allowed, everything else muted. We never call `setInterruptionFilter` or `setNotificationPolicy`, so the user's own setting is never written.
- The rule is switched on and off with `setAutomaticZenRuleState` (needs Android 11+; older versions get an `UNSUPPORTED_SDK` error).
- Each future window gets one exact alarm (`setExactAndAllowWhileIdle`) at its start. If exact alarms are not allowed, `setWindow` with a 2-minute window is used (D16), plus a Doze-exempt backup alarm 30 s after that window; whichever fires first silences and the other is ignored (`mode=window-backup` in the log means the backup was needed, because `setWindow` is not delivered in Doze).
- The end of a silence has an exact alarm plus an inexact safety alarm 30 s later. Revoking exact alarms cancels the exact one, the safety one still restores sound. When the app next runs it notices the change and re-arms everything.
- Any entry point (app open, alarm, reboot) restores sound if the end time has passed. If the notice is swiped away it comes back; if notifications are off the log says `notice_blocked` and the in-app **Unmute now** is the way out.
- Backup of app data is off (`allowBackup=false`), so a restored phone never inherits old alarm state.
- The notification is ongoing, with an **Unmute now** action. The boot receiver re-arms after a restart, an app update, or a change of the exact-alarm permission. It never starts a foreground service.
- State (plan, active silence, log of the last 300 events) is kept in app storage so everything works without the app running.

## Build checks

- `pnpm typecheck`, `pnpm test` (14 tests), `pnpm lint`, `node scripts/check-engine-boundary.mjs` and its self-test (10 cases) all pass.
- Release manifest of the arm64-v8a build (merged, read with `aapt2 dump permissions`): `SCHEDULE_EXACT_ALARM` present, **`USE_EXACT_ALARM` absent** (G6 passes). Also present: `ACCESS_NOTIFICATION_POLICY`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, location permissions. Absent: `SYSTEM_ALERT_WINDOW`, storage permissions.
- The APK is the **release variant signed with the debug key**, not minified. It carries its own JavaScript, so it runs without a dev server. The development-client debug variant would show a "connect to server" screen instead of the app.
- Not run on a device: there is no emulator on the build machine, so the Android code is compiled but untested until the steps above are done on the phone.
