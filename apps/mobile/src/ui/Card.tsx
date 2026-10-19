import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { color, radius, shadow } from "../theme/tokens";
import { PressScale } from "./motion";

export function Card({
  children,
  style,
  onPress,
  accent,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Left accent stripe colour. */
  accent?: string;
}) {
  const body = (
    <>
      {accent ? <View style={[styles.accent, { backgroundColor: accent }]} /> : null}
      {children}
    </>
  );
  if (onPress) {
    return (
      <PressScale onPress={onPress} accessibilityRole="button" style={[styles.card, style]}>
        {body}
      </PressScale>
    );
  }
  return <View style={[styles.card, style]}>{body}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "transparent",
    padding: 18,
    overflow: "hidden",
    ...shadow.card,
  },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
});
