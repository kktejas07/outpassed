import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { color, font } from "../theme/tokens";
import { Text } from "../ui/Text";

/** Outpass mark: an indigo arch (the gate) with a gold keystone that settles in. */
export function Brand({ size = 64 }: { size?: number }) {
  const drop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(drop, { toValue: 1, duration: 700, delay: 150, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
  }, [drop]);
  const w = size;
  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <View style={{ width: w, height: w, borderRadius: w * 0.28, backgroundColor: color.indigo, alignItems: "center", justifyContent: "flex-end", overflow: "hidden" }}>
        <View style={[styles.arch, { width: w * 0.56, height: w * 0.62, borderTopLeftRadius: w * 0.28, borderTopRightRadius: w * 0.28, borderWidth: w * 0.085 }]} />
        <Animated.View
          style={[
            styles.key,
            {
              width: w * 0.16,
              height: w * 0.16,
              top: w * 0.13,
              opacity: drop,
              transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.3, 0] }) }, { rotate: "45deg" }],
            },
          ]}
        />
      </View>
      <Text style={{ fontFamily: font.display, fontSize: size * 0.44, color: color.ink, letterSpacing: -0.5 }}>outpass</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  arch: { borderColor: color.white, borderBottomWidth: 0 },
  key: { position: "absolute", backgroundColor: color.goldLight, borderRadius: 3 },
});
