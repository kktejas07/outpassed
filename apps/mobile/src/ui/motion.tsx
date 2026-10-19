import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, View, type DimensionValue, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { Text } from "./Text";

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

/** Fades and rises into place. `index` staggers items in a list. */
export function FadeIn({
  children,
  index = 0,
  delay = 0,
  distance = 12,
  style,
}: {
  children: ReactNode;
  index?: number;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 420,
      delay: delay + Math.min(index, 8) * 55,
      easing: ease,
      useNativeDriver: true,
    }).start();
  }, [v, index, delay]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Pops in with a slight overshoot; used for verdicts and success states. */
export function PopIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/** A slow breathing glow, for "live" things like the gate pass. */
export function usePulse(active = true) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, active]);
  return v;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that scales down slightly while pressed. Layout styles (flex, width) apply to it directly. */
export function PressScale({ style, children, ...rest }: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  const to = (toValue: number) => Animated.spring(v, { toValue, friction: 7, tension: 300, useNativeDriver: true }).start();
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => { to(0.97); rest.onPressIn?.(e); }}
      onPressOut={(e) => { to(1); rest.onPressOut?.(e); }}
      style={[style, { transform: [{ scale: v }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** True when the person has asked their phone for less motion. */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((r) => alive && setReduce(r)).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}

/** A number that counts up to its value (and re-counts when it changes). */
export function CountUp({ value, format = (n: number) => String(Math.round(n)), style, duration = 700 }: { value: number; format?: (n: number) => string; style?: StyleProp<TextStyle>; duration?: number }) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const start = Date.now();
    const begin = from.current;
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(begin + (value - begin) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce]);
  return <Text style={style}>{format(shown)}</Text>;
}

/** Grey placeholder with a light sweep, while content loads. */
export function Shimmer({ height = 16, width = "100%", radius = 8, style }: { height?: number; width?: DimensionValue; radius?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={[{ height, width, borderRadius: radius, backgroundColor: "#E9EBF5", overflow: "hidden" }, style]}>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 120,
          backgroundColor: "rgba(255,255,255,0.65)",
          transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-120, 420] }) }, { skewX: "-20deg" }],
        }}
      />
    </View>
  );
}

/** A few placeholder cards for list screens. */
export function ShimmerList({ rows = 3 }: { rows?: number }) {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ backgroundColor: "#fff", borderRadius: 22, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Shimmer width={42} height={42} radius={21} />
            <View style={{ flex: 1, gap: 8 }}>
              <Shimmer width="60%" />
              <Shimmer width="40%" height={12} />
            </View>
          </View>
          <Shimmer height={12} width="85%" />
        </View>
      ))}
    </View>
  );
}

/** Shakes once on mount: a "no" for denied passes and failed checks. */
export function Shake({ children, style, active = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; active?: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    Animated.sequence(
      [10, -9, 7, -5, 3, 0].map((x) => Animated.timing(v, { toValue: x, duration: 55, easing: Easing.linear, useNativeDriver: true })),
    ).start();
  }, [v, active]);
  return <Animated.View style={[style, { transform: [{ translateX: v }] }]}>{children}</Animated.View>;
}

/** Expanding rings behind a success icon. */
export function SuccessRings({ color: ring, size = 72 }: { color: string; size?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.stagger(180, [a, b].map((v) => Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }))).start();
  }, [a, b]);
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {[a, b].map((v, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: ring,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
          }}
        />
      ))}
    </View>
  );
}

/** Springs from small to full size: icons that "land". */
export function Bounce({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true })]).start();
  }, [v, delay]);
  return <Animated.View style={[style, { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]}>{children}</Animated.View>;
}
