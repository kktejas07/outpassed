import Ionicons from "@expo/vector-icons/Ionicons";
import type { OutpassDto } from "@outpassed/shared";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from "react-native";
import { studentLine, when } from "../lib/format";
import { color, font, radius, shadow } from "../theme/tokens";
import { Avatar } from "../ui/bits";
import { usePulse } from "../ui/motion";
import { QrCode } from "../ui/QrCode";
import { Text } from "../ui/Text";

/**
 * The accent pass the student shows at the gate. The QR changes every few
 * seconds; the bar under it drains until the next refresh so a guard can see
 * it is live, not a screenshot.
 */
export function GatePass({
  outpass,
  token,
  lifetime,
  error,
}: {
  outpass: OutpassDto;
  token: string | null;
  /** Seconds this token is shown before it's refreshed. */
  lifetime: number;
  error?: string | null;
}) {
  const glow = usePulse(true);
  const drain = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!token) return;
    drain.setValue(1);
    const anim = Animated.timing(drain, { toValue: 0, duration: lifetime * 1000, easing: Easing.linear, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [token, lifetime, drain]);

  const out = outpass.status === "OUT";

  return (
    <View style={[styles.frame, shadow.accent]}>
      <Animated.View style={[styles.glow, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) }]} />
      <View style={styles.pass}>
        <View style={styles.top}>
          <Avatar name={outpass.student.name} size={44} tone="accent" />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{outpass.student.name}</Text>
            <Text variant="caption">{studentLine(outpass.student) || "Student"}</Text>
          </View>
          <View style={styles.live}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        <View style={styles.qrBox}>
          {token ? (
            <QrCode value={token} size={208} />
          ) : (
            <View style={styles.qrPlaceholder}>
              {error ? <Ionicons name="cloud-offline-outline" size={28} color={color.muted} /> : <ActivityIndicator color={color.accent} />}
            </View>
          )}
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.bar, { width: drain.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
        </View>
        <Text variant="caption" style={{ textAlign: "center" }}>
          {error ? error : out ? "Show this when you're back at the gate" : "Show this to the guard at the gate"}
        </Text>

        <View style={styles.perf}>
          <View style={[styles.notch, { left: -26 }]} />
          <View style={styles.dash} />
          <View style={[styles.notch, { right: -26 }]} />
        </View>

        <View style={styles.meta}>
          <View style={{ flex: 1 }}>
            <Text variant="eyebrow">Destination</Text>
            <Text variant="label" numberOfLines={1}>{outpass.destination}</Text>
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text variant="eyebrow">{out ? "Return by" : "Valid from"}</Text>
            <Text variant="label">{when(out ? outpass.returnBy : outpass.leaveAt)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 26, padding: 3, backgroundColor: color.accentFrame },
  glow: { ...StyleSheet.absoluteFill, borderRadius: 26, backgroundColor: color.accentLight },
  pass: { backgroundColor: color.white, borderRadius: 23, padding: 18, gap: 12, overflow: "hidden" },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  live: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: color.greenSoft, paddingHorizontal: 8, height: 24, borderRadius: radius.pill },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.greenBright },
  liveText: { fontFamily: font.bodyBold, fontSize: 10.5, color: color.green, letterSpacing: 0.8 },
  qrBox: { alignSelf: "center", padding: 12, borderRadius: 18, borderWidth: 1, borderColor: color.line, backgroundColor: color.white },
  qrPlaceholder: { width: 208, height: 208, alignItems: "center", justifyContent: "center" },
  track: { height: 4, borderRadius: 2, backgroundColor: color.accentSoft, overflow: "hidden", marginHorizontal: 30 },
  bar: { height: 4, borderRadius: 2, backgroundColor: color.accent },
  perf: { height: 20, justifyContent: "center", marginHorizontal: -18 },
  notch: { position: "absolute", width: 36, height: 20, borderRadius: 10, backgroundColor: color.accentFrame },
  dash: { marginHorizontal: 22, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: color.accentLight },
  meta: { flexDirection: "row", gap: 12 },
});
