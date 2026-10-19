import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { color, font } from "../theme/tokens";
import { Mark } from "../ui/Mark";
import { Text } from "../ui/Text";

/** Outpass mark and wordmark; the mark settles in with a small drop. */
export function Brand({ size = 64 }: { size?: number }) {
  const drop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(drop, { toValue: 1, duration: 650, delay: 120, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
  }, [drop]);
  return (
    <Animated.View style={{ alignItems: "center", gap: 10, opacity: drop, transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }] }}>
      <Mark size={size} />
      <Text style={{ fontFamily: font.display, fontSize: size * 0.44, color: color.ink, letterSpacing: -0.5 }}>outpass</Text>
    </Animated.View>
  );
}
