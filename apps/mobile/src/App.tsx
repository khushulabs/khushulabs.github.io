// SPDX-License-Identifier: GPL-3.0-or-later
import { getStatus, ping, type Status } from "khushu-engine";
import { useEffect, useState } from "react";
import { StatusBar, StyleSheet, Text, View } from "react-native";

function readVersion(): string {
  try {
    return ping();
  } catch (e) {
    return `unavailable (${e instanceof Error ? e.message : String(e)})`;
  }
}

export default function App() {
  const [version] = useState(readVersion);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    getStatus().then(setStatus, () => setStatus(null));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Khushu</Text>
      <Text testID="engine-version">Engine {version}</Text>
      <Text>Status: {status?.state ?? "…"}</Text>
      <StatusBar barStyle="default" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  title: { fontSize: 28, fontWeight: "600" },
});
