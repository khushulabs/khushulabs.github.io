// SPDX-License-Identifier: GPL-3.0-or-later
import {
  addStatusChangedListener,
  checkPermissions,
  formatTime,
  getHistory,
  getStatus,
  openPermissionSettings,
  ping,
  setPlan,
  startManual,
  stopSilence,
  type HistoryEvent,
  type PermissionKind,
  type PermissionState,
  type Plan,
  type Status,
  type TimeWindow,
} from "khushu-engine";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  PermissionsAndroid,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from "react-native";

import { summariseAlarms } from "./spikeLog";

// Spike S-A screen (KH-001). Debug only: grant permissions, start silences, read the log.

const RULE_NAME = "Khushu spike";
const MIN = 60_000;
const ALARM_TEST_COUNT = 20;
/** A button stays off at least this long after a tap, so a repeated tap cannot re-arm. */
const BUSY_MIN_MS = 800;

const PERMISSION_ROWS: { kind: PermissionKind; label: string }[] = [
  { kind: "notifications", label: "Notifications" },
  { kind: "notificationPolicy", label: "Do Not Disturb access" },
  { kind: "exactAlarm", label: "Alarms & reminders (exact)" },
];

function plan(windows: TimeWindow[]): Plan {
  return {
    ruleName: RULE_NAME,
    notice: { title: `Silenced for ${RULE_NAME}`, body: "Back on at {until}" },
    unmuteLabel: "Unmute now",
    windows,
  };
}

function clock(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** Time for people: follows the phone's 12/24-hour setting (asked from the engine). */
function fmt(ms: number, withSeconds = false): string {
  try {
    return formatTime(ms, withSeconds);
  } catch {
    return clock(ms);
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function Button({
  label,
  onPress,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled === true}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        danger && styles.danger,
        disabled && styles.disabled,
        pressed && (danger ? styles.pressedDanger : styles.pressed),
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [version] = useState(() => {
    try {
      return ping();
    } catch (e) {
      return `unavailable (${message(e)})`;
    }
  });
  const [status, setStatus] = useState<Status | null>(null);
  const [perms, setPerms] = useState<PermissionState | null>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [testStart, setTestStart] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const busyRef = useRef(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, p, h] = await Promise.all([getStatus(), checkPermissions(), getHistory()]);
      setStatus(s);
      setPerms(p);
      setEvents(h);
    } catch (e) {
      setError(message(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    const sub = addStatusChangedListener(setStatus);
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      appState.remove();
    };
  }, [refresh]);

  const showFeedback = useCallback((text: string) => {
    setFeedback(text);
    ToastAndroid.show(text, ToastAndroid.SHORT);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 8000);
  }, []);

  /** Runs one action with taps ignored meanwhile. The action may return a line to show as feedback. */
  const run = useCallback(
    async (action: () => Promise<string | void>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      const startedAt = Date.now();
      try {
        const text = await action();
        if (text) showFeedback(text);
      } catch (e) {
        setError(message(e));
      }
      await refresh();
      const rest = BUSY_MIN_MS - (Date.now() - startedAt);
      if (rest > 0) await new Promise((resolve) => setTimeout(resolve, rest));
      busyRef.current = false;
      setBusy(false);
    },
    [refresh, showFeedback],
  );

  const grant = (kind: PermissionKind) =>
    run(async () => {
      if (kind === "notifications") {
        const result = await PermissionsAndroid.request("android.permission.POST_NOTIFICATIONS");
        if (result === PermissionsAndroid.RESULTS.GRANTED) return "Notifications allowed";
      }
      await openPermissionSettings(kind);
      return "Opening settings…";
    });

  const scheduleIn = (delayMin: number, lengthMin: number) =>
    run(async () => {
      const startsAt = Date.now() + delayMin * MIN;
      await setPlan(plan([{ id: `spike-${startsAt}`, startsAt, endsAt: startsAt + lengthMin * MIN, fenceIds: [] }]));
      return `Scheduled: silence at ${fmt(startsAt)} for ${lengthMin} min`;
    });

  const silenceNow = (minutes: number) =>
    run(async () => {
      await startManual(minutes);
      return `Silenced now, back on at ${fmt(Date.now() + minutes * MIN)}`;
    });

  const unmute = () =>
    run(async () => {
      await stopSilence();
      return "Unmuted";
    });

  const alarmTest = () =>
    run(async () => {
      const first = Date.now() + 2 * MIN;
      const windows = Array.from({ length: ALARM_TEST_COUNT }, (_, i): TimeWindow => {
        const startsAt = first + i * MIN;
        return { id: `alarm-test-${i + 1}`, startsAt, endsAt: startsAt + 30_000, fenceIds: [] };
      });
      setTestStart(Date.now());
      await setPlan(plan(windows));
      return `Scheduled: ${ALARM_TEST_COUNT} alarms, first at ${fmt(first)}`;
    });

  const cancelScheduled = () =>
    run(async () => {
      await setPlan(plan([]));
      return "Cancelled scheduled silences";
    });

  const shareLog = () =>
    Share.share({
      message: events.map((e) => `${clock(e.at)} ${e.type} ${e.windowId ?? ""} ${e.detail ?? ""}`.trim()).join("\n"),
    }).catch((e: unknown) => setError(message(e)));

  const summary = summariseAlarms(events, MIN, testStart);
  const stateLine = status
    ? `${status.state}${status.reason ? ` (${status.reason})` : ""}${
        status.silencedUntil ? `, back on at ${fmt(status.silencedUntil, true)}` : ""
      }`
    : "…";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar barStyle="default" />
      <Text style={styles.title}>Khushu · spike S-A</Text>
      <Text testID="engine-version">Engine {version}</Text>

      <Text style={styles.heading}>Permissions</Text>
      {PERMISSION_ROWS.map(({ kind, label }) => (
        <View key={kind} style={styles.row}>
          <Text style={styles.rowText}>
            {label}: {perms?.[kind] ?? "…"}
          </Text>
          {perms?.[kind] === "granted" ? null : <Button label="Grant" disabled={busy} onPress={() => void grant(kind)} />}
        </View>
      ))}

      <Text style={styles.heading}>Status</Text>
      <Text style={styles.status}>{stateLine}</Text>
      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.heading}>Tests</Text>
      <Button label="Silence in 2 min for 3 min" disabled={busy} onPress={() => void scheduleIn(2, 3)} />
      <Button label="Silence in 45 min for 3 min (Doze test)" disabled={busy} onPress={() => void scheduleIn(45, 3)} />
      <Button label="Silence now for 2 min" disabled={busy} onPress={() => void silenceNow(2)} />
      <Button
        label={`${ALARM_TEST_COUNT}-alarm test (one a minute, about 22 min)`}
        disabled={busy}
        onPress={() => void alarmTest()}
      />
      <Button label="Unmute now" danger disabled={busy} onPress={() => void unmute()} />
      <Button label="Cancel scheduled silences" disabled={busy} onPress={() => void cancelScheduled()} />

      {testStart > 0 ? (
        <Text style={styles.status}>
          Alarm test: {summary.onTime}/{ALARM_TEST_COUNT} on time (±1 min), {summary.fired} fired, worst{" "}
          {Math.round(summary.worstMs / 1000)} s, slowest rule on {summary.slowestActivationMs} ms
        </Text>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.heading}>Log</Text>
        <Button label="Share log" onPress={() => void shareLog()} />
      </View>
      {[...events]
        .reverse()
        .slice(0, 60)
        .map((e) => (
          <Text key={`${e.at}-${e.type}-${e.windowId ?? ""}-${e.detail ?? ""}`} style={styles.log}>
            {clock(e.at)} {e.type} {e.windowId ?? ""} {e.detail ?? ""}
          </Text>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 56, gap: 8 },
  title: { fontSize: 24, fontWeight: "600" },
  heading: { fontSize: 16, fontWeight: "600", marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowText: { flex: 1 },
  status: { fontSize: 15 },
  error: { color: "#b00020" },
  button: { backgroundColor: "#1b5e20", borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 },
  danger: { backgroundColor: "#b71c1c" },
  pressed: { backgroundColor: "#0b3d0f", transform: [{ scale: 0.97 }] },
  pressedDanger: { backgroundColor: "#7f0000", transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.45 },
  feedback: { color: "#1b5e20", fontWeight: "600" },
  buttonText: { color: "#fff", fontWeight: "600" },
  log: { fontFamily: "monospace", fontSize: 11 },
});
