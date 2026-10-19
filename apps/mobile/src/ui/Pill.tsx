import { StyleSheet, View } from "react-native";
import { color, font, radius } from "../theme/tokens";
import { Text } from "./Text";

export type PillTone = "accent" | "indigo" | "green" | "amber" | "red" | "neutral";

const tones: Record<PillTone, { bg: string; fg: string; dot: string }> = {
  accent: { bg: color.accentSoft, fg: color.accentText, dot: color.accent },
  indigo: { bg: color.indigoTint, fg: color.indigo, dot: color.indigo },
  green: { bg: color.greenSoft, fg: color.green, dot: color.greenBright },
  amber: { bg: color.amberSoft, fg: color.amber, dot: "#D97706" },
  red: { bg: color.redSoft, fg: color.red, dot: color.red },
  neutral: { bg: "#F4F4F8", fg: color.muted, dot: color.faint },
};

export function Pill({ label, tone = "neutral" }: { label: string; tone?: PillTone }) {
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <View style={[styles.dot, { backgroundColor: t.dot }]} />
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, height: 26, borderRadius: radius.pill },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: font.bodyBold, fontSize: 12 },
});
