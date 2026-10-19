import Ionicons from "@expo/vector-icons/Ionicons";
import type { OutpassDto } from "@outpassed/shared";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { outpassStatus, outpassTypes, when } from "../lib/format";
import { color, font, radius, shadow } from "../theme/tokens";
import { PressScale } from "../ui/motion";
import { Text } from "../ui/Text";

/** The student's current pass as a filled indigo card, like the design's featured card. */
export function PassFeature({ outpass }: { outpass: OutpassDto }) {
  const status = outpassStatus(outpass);
  const type = outpassTypes.find((t) => t.value === outpass.type);
  const usable = outpass.status === "APPROVED" || outpass.status === "OUT";
  return (
    <PressScale onPress={() => router.push(`/outpass/${outpass.id}`)} accessibilityRole="button" style={[styles.card, shadow.primary]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.circle, { width: 180, height: 180, borderRadius: 90, right: -60, bottom: -70 }]} />
        <View style={[styles.circle, { width: 26, height: 26, borderRadius: 13, right: 70, top: 26, borderWidth: 3, backgroundColor: "transparent" }]} />
      </View>
      <View style={styles.top}>
        <View style={styles.typeIcon}>
          <Ionicons name={type?.icon ?? "navigate-outline"} size={18} color={color.white} />
        </View>
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: outpass.overdue ? "#F87171" : usable ? color.accentLight : "#FBBF24" }]} />
          <Text style={styles.statusText}>{status.label}</Text>
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.eyebrow}>{type?.label} outpass</Text>
        <Text style={styles.title} numberOfLines={1}>{outpass.destination}</Text>
      </View>
      <View style={styles.times}>
        <View style={{ flex: 1 }}>
          <Text style={styles.k}>Leave</Text>
          <Text style={styles.v}>{when(outpass.leaveAt)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.k}>Back by</Text>
          <Text style={styles.v}>{when(outpass.returnBy)}</Text>
        </View>
      </View>
      {usable ? (
        <View style={styles.cta}>
          <Ionicons name="qr-code-outline" size={18} color={color.indigoDeep} />
          <Text style={styles.ctaText}>Show gate pass</Text>
        </View>
      ) : null}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.indigoDeep, borderRadius: radius.lg + 4, padding: 20, gap: 16, overflow: "hidden" },
  circle: { position: "absolute", backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.18)" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typeIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  status: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: font.bodyBold, fontSize: 12, color: color.white },
  eyebrow: { fontFamily: font.bodySemi, fontSize: 13, color: color.headSub },
  title: { fontFamily: font.display, fontSize: 24, color: color.white, letterSpacing: -0.3 },
  times: { flexDirection: "row", gap: 12 },
  k: { fontFamily: font.body, fontSize: 12, color: color.headSub },
  v: { fontFamily: font.bodyBold, fontSize: 14.5, color: color.white },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: radius.md, backgroundColor: color.white },
  ctaText: { fontFamily: font.bodyBold, fontSize: 15, color: color.indigoDeep },
});
