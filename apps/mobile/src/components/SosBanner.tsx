import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useOpenSos } from "../features/sos/useSos";
import { color, font, radius } from "../theme/tokens";
import { Text } from "../ui/Text";

const LABEL = { MEDICAL: "Medical", SAFETY: "Safety", OTHER: "Help needed" } as const;

/** Red, pulsing banner on staff screens while any SOS is open. */
export function SosBanner() {
  const open = useOpenSos();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!open.length) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [open.length, pulse]);
  if (!open.length) return null;
  const first = open[0]!;
  const place = [first.raisedBy.hostel, first.raisedBy.room ? `Room ${first.raisedBy.room}` : null].filter(Boolean).join(", ");
  return (
    <Pressable onPress={() => router.push("/sos")} accessibilityRole="button" style={styles.banner}>
      <View style={styles.dotWrap}>
        <Animated.View style={[styles.halo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }] }]} />
        <Ionicons name="alert" size={18} color={color.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          SOS · {LABEL[first.kind]} · {first.raisedBy.name}
          {open.length > 1 ? ` +${open.length - 1}` : ""}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {first.status === "ACKNOWLEDGED" ? `${first.acknowledgedByName} is responding` : "No one has responded yet"}
          {place ? ` · ${place}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={color.white} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: color.red },
  dotWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: 34, height: 34, borderRadius: 17, backgroundColor: color.white },
  title: { fontFamily: font.bodyBold, fontSize: 15, color: color.white },
  sub: { fontFamily: font.body, fontSize: 12.5, color: "rgba(255,255,255,0.9)" },
});
