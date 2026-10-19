import Ionicons from "@expo/vector-icons/Ionicons";
import { Component, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { reportError } from "../lib/crashReporter";
import { color, font } from "../theme/tokens";
import { Button } from "./Button";
import { Text } from "./Text";

/** If a screen crashes, show a way back instead of a blank page, and report it. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    void reportError(error, true);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.page}>
        <View style={styles.icon}><Ionicons name="refresh" size={28} color={color.indigo} /></View>
        <Text style={styles.title}>This screen hit a problem</Text>
        <Text variant="caption" style={{ textAlign: "center", maxWidth: 300 }}>It's been reported. Try again; your passes and data are safe.</Text>
        <Button label="Try again" icon="refresh" onPress={() => this.setState({ failed: false })} style={{ alignSelf: "stretch", marginTop: 8 }} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32, backgroundColor: color.ground },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: color.indigoTint, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  title: { fontFamily: font.display, fontSize: 21, color: color.ink, textAlign: "center" },
});
