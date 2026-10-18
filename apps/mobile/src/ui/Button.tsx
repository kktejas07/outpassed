import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { color, font, radius, shadow } from "../theme/tokens";
import { PressScale } from "./motion";
import { Text } from "./Text";

type Tone = "accent" | "indigo" | "outline" | "ghost" | "danger" | "success";

const tones: Record<Tone, { bg: string; fg: string; border?: string }> = {
  // Primary action: indigo, as in the design.
  accent: { bg: color.indigo, fg: color.white },
  indigo: { bg: color.indigo, fg: color.white },
  outline: { bg: color.white, fg: color.ink, border: color.line },
  ghost: { bg: "transparent", fg: color.indigo },
  danger: { bg: color.white, fg: color.red, border: "#F3C7C7" },
  success: { bg: color.green, fg: color.white },
};

export function Button({
  label,
  onPress,
  tone = "accent",
  icon,
  loading,
  disabled,
  style,
  compact,
}: {
  label: string;
  onPress?: () => void;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const t = tones[tone];
  const off = disabled || loading;
  return (
    <PressScale
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      style={[
        styles.base,
        compact && styles.compact,
        { backgroundColor: t.bg, borderColor: t.border ?? t.bg, opacity: off ? 0.55 : 1 },
        (tone === "accent" || tone === "indigo") && !off ? shadow.primary : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={t.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={compact ? 16 : 18} color={t.fg} /> : null}
          <Text style={[styles.label, compact && styles.labelCompact, { color: t.fg }]}>{label}</Text>
        </View>
      )}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  base: { height: 54, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  compact: { height: 40, borderRadius: radius.sm, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontFamily: font.bodyBold, fontSize: 15.5 },
  labelCompact: { fontSize: 14 },
});
