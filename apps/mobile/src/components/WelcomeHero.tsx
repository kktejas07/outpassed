import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, radius } from "../theme/tokens";
import { Mark } from "../ui/Mark";
import { useReduceMotion } from "../ui/motion";
import { Text } from "../ui/Text";

/**
 * The sign-in screen's top panel: the campus gate drawn large, with a pass
 * card and an "exit recorded" tick floating beside it, then the headline.
 * Everything settles in once, in one short sequence.
 */
export function WelcomeHero() {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const gate = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const tick = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      gate.setValue(1);
      card.setValue(1);
      tick.setValue(1);
      return;
    }
    Animated.sequence([
      Animated.timing(gate, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(card, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
        Animated.sequence([Animated.delay(160), Animated.spring(tick, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true })]),
      ]),
    ]).start();
  }, [reduce, gate, card, tick]);

  return (
    <View style={[styles.panel, { paddingTop: insets.top + 18 }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.glow, { width: 340, height: 340, borderRadius: 170, top: -60, right: -120 }]} />
        <View style={[styles.glow, { width: 220, height: 220, borderRadius: 110, bottom: -70, left: -80, opacity: 0.6 }]} />
      </View>

      <View style={styles.brandRow}>
        <Mark size={30} />
        <Text style={styles.brand}>outpass</Text>
      </View>

      {/* The gate */}
      <View style={styles.scene} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.arch, { opacity: gate, transform: [{ translateY: gate.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
          <View style={styles.keystone} />
          <View style={styles.road} />
        </Animated.View>

        {/* A pass, as the guard sees it */}
        <Animated.View
          style={[
            styles.pass,
            { opacity: card, transform: [{ translateX: card.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }, { rotate: "-6deg" }] },
          ]}
        >
          <View style={styles.passAvatar}><Text style={styles.passInitials}>AR</Text></View>
          <View style={{ gap: 2 }}>
            <Text style={styles.passName}>Asha Rao</Text>
            <View style={styles.passRow}>
              <View style={styles.passDot} />
              <Text style={styles.passMeta}>Exit allowed</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={[styles.tick, { opacity: tick, transform: [{ scale: tick.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
          <Ionicons name="checkmark" size={26} color={color.white} />
        </Animated.View>

        <Animated.View style={[styles.time, { opacity: card }]}>
          <Ionicons name="time-outline" size={14} color={color.indigoDeep} />
          <Text style={styles.timeText}>Back by 7:30 PM</Text>
        </Animated.View>
      </View>

      <Text style={styles.headline} accessibilityRole="header">
        Every exit and entry,{"\n"}
        <Text style={[styles.headline, { color: "#A5F3E4" }]}>on record.</Text>
      </Text>
      <Text style={styles.sub}>Outpasses, visitors and the gate log for your campus. Parents and wardens approve from their phones.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: color.indigo, paddingHorizontal: 24, paddingBottom: 30, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: "hidden", gap: 14 },
  glow: { position: "absolute", backgroundColor: "rgba(255,255,255,0.07)" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brand: { fontFamily: font.display, fontSize: 20, color: color.white, letterSpacing: -0.4 },
  scene: { height: 220, alignItems: "center", justifyContent: "flex-end", marginTop: 4 },
  arch: { width: 170, height: 190, borderTopLeftRadius: 85, borderTopRightRadius: 85, borderWidth: 20, borderBottomWidth: 0, borderColor: "rgba(255,255,255,0.92)", alignItems: "center" },
  keystone: { position: "absolute", top: -34, width: 26, height: 26, borderRadius: 4, backgroundColor: color.accentLight, transform: [{ rotate: "45deg" }] },
  road: { position: "absolute", bottom: 0, width: 70, height: 110, backgroundColor: "rgba(255,255,255,0.1)", borderTopLeftRadius: 35, borderTopRightRadius: 35 },
  pass: { position: "absolute", left: 4, bottom: 46, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: color.white, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  passAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: color.indigoTint, alignItems: "center", justifyContent: "center" },
  passInitials: { fontFamily: font.displaySemi, fontSize: 13, color: color.indigo },
  passName: { fontFamily: font.bodyBold, fontSize: 13.5, color: color.ink },
  passRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  passDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.accentLight },
  passMeta: { fontFamily: font.bodySemi, fontSize: 12, color: color.accentText },
  tick: { position: "absolute", right: 34, top: 18, width: 52, height: 52, borderRadius: 26, backgroundColor: color.accentLight, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: color.indigo },
  time: { position: "absolute", right: 0, bottom: 14, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 32, borderRadius: radius.pill, backgroundColor: color.white },
  timeText: { fontFamily: font.bodyBold, fontSize: 12.5, color: color.indigoDeep },
  headline: { fontFamily: font.display, fontSize: 30, lineHeight: 36, color: color.white, letterSpacing: -0.7 },
  sub: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: "#E0E7FF" },
});
