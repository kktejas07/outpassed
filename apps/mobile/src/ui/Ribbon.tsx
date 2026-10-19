import Ionicons from "@expo/vector-icons/Ionicons";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, radius } from "../theme/tokens";
import { Text } from "./Text";

/**
 * Ribbon: the banner that slides down from the top after something happens,
 * e.g. "Request sent", "Exit recorded", or a new alert arriving. Big moments
 * (`celebrate`) also drop a short burst of confetti ribbons.
 */

export type RibbonTone = "success" | "info" | "warning" | "danger";

export type RibbonInput = {
  tone?: RibbonTone;
  title: string;
  body?: string;
  celebrate?: boolean;
  onPress?: () => void;
  /** Milliseconds before it slides away. */
  duration?: number;
};

type Shown = RibbonInput & { id: number };

const RibbonContext = createContext<{ show: (r: RibbonInput) => void } | null>(null);

const tones: Record<RibbonTone, { icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string; edge: string }> = {
  success: { icon: "checkmark-circle", fg: color.green, bg: color.greenSoft, edge: color.greenBright },
  info: { icon: "notifications", fg: color.indigo, bg: color.indigoTint, edge: color.indigo },
  warning: { icon: "time", fg: color.amber, bg: color.amberSoft, edge: "#D97706" },
  danger: { icon: "alert-circle", fg: color.red, bg: color.redSoft, edge: color.red },
};

let nextId = 1;

export function RibbonProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Shown | null>(null);
  const [burst, setBurst] = useState(0);
  const queue = useRef<Shown[]>([]);

  const advance = useCallback(() => {
    setCurrent(queue.current.shift() ?? null);
  }, []);

  const show = useCallback((r: RibbonInput) => {
    const item = { ...r, id: nextId++ };
    if (r.celebrate) setBurst((b) => b + 1);
    AccessibilityInfo.announceForAccessibility?.(`${r.title}${r.body ? `. ${r.body}` : ""}`);
    setCurrent((cur) => {
      if (!cur) return item;
      queue.current.push(item);
      return cur;
    });
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <RibbonContext.Provider value={value}>
      {children}
      {burst ? <Confetti key={burst} /> : null}
      {current ? <RibbonView key={current.id} ribbon={current} onDone={advance} /> : null}
    </RibbonContext.Provider>
  );
}

export function useRibbon() {
  const ctx = useContext(RibbonContext);
  if (!ctx) throw new Error("useRibbon must be used inside RibbonProvider");
  return ctx;
}

function RibbonView({ ribbon, onDone }: { ribbon: Shown; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const t = tones[ribbon.tone ?? "success"];

  const hide = useCallback(() => {
    Animated.timing(y, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onDone());
  }, [y, onDone]);

  useEffect(() => {
    Animated.spring(y, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }).start();
    Animated.timing(shine, { toValue: 1, duration: 1100, delay: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    const timer = setTimeout(hide, ribbon.duration ?? (ribbon.body ? 4200 : 3000));
    return () => clearTimeout(timer);
  }, [y, shine, hide, ribbon.duration, ribbon.body]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { paddingTop: insets.top + 8, opacity: y, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] }) }] },
      ]}
    >
      <Pressable
        accessibilityRole={ribbon.onPress ? "button" : "alert"}
        onPress={() => {
          ribbon.onPress?.();
          hide();
        }}
        style={[styles.ribbon, { backgroundColor: t.bg, borderColor: t.edge }]}
      >
        <View style={[styles.edge, { backgroundColor: t.edge }]} />
        <Ionicons name={t.icon} size={22} color={t.fg} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.fg }]} numberOfLines={1}>{ribbon.title}</Text>
          {ribbon.body ? <Text variant="caption" style={{ color: color.ink }} numberOfLines={2}>{ribbon.body}</Text> : null}
        </View>
        {ribbon.onPress ? <Ionicons name="chevron-forward" size={18} color={t.fg} /> : null}
        {/* A light sweep across the ribbon as it lands. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.shine, { transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-80, 460] }) }, { rotate: "18deg" }] }]}
        />
      </Pressable>
    </Animated.View>
  );
}

const PIECES = 26;
const COLORS = [color.accent, color.accentLight, color.indigo, color.greenBright, "#F472B6"];

/** A short burst of falling ribbons for big moments. */
function Confetti() {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 120,
        delay: Math.random() * 250,
        dur: 1300 + Math.random() * 900,
        spin: (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 3),
        w: 6 + Math.random() * 6,
        h: 12 + Math.random() * 10,
        c: COLORS[i % COLORS.length]!,
        v: new Animated.Value(0),
      })),
    [width],
  );
  const [done, setDone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.().then((reduce) => {
      if (cancelled) return;
      if (reduce) return setDone(true);
      Animated.parallel(
        pieces.map((p) => Animated.timing(p.v, { toValue: 1, duration: p.dur, delay: p.delay, easing: Easing.in(Easing.quad), useNativeDriver: true })),
      ).start(() => setDone(true));
    });
    return () => {
      cancelled = true;
    };
  }, [pieces]);
  if (done) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: p.x,
            top: -30,
            width: p.w,
            height: p.h,
            borderRadius: 2,
            backgroundColor: p.c,
            opacity: p.v.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.75] }) },
              { translateX: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.spin * 180}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 12, zIndex: 50 },
  ribbon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingLeft: 18,
    paddingRight: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#1E1B4B",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  edge: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  title: { fontFamily: font.bodyBold, fontSize: 15 },
  shine: { position: "absolute", top: -20, bottom: -20, width: 36, backgroundColor: "rgba(255,255,255,0.55)" },
});
