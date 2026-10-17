import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

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
