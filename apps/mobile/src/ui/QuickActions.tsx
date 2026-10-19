import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { color, font, radius } from "../theme/tokens";
import { PressScale } from "./motion";
import { Text } from "./Text";

export type QuickAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  badge?: number;
  tone?: "default" | "danger";
};

/** Grid of large shortcut tiles with optional count badges. */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  // Up to five fit on one row; more wrap in rows of four.
  const width = actions.length <= 5 ? `${100 / actions.length}%` : "25%";
  return (
    <View style={styles.grid}>
      {actions.map((a) => {
        const danger = a.tone === "danger";
        return (
          <PressScale key={a.key} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.badge ? `${a.label}, ${a.badge} new` : a.label} style={[styles.cell, { width: width as `${number}%` }]}>
            <View style={[styles.tile, danger && styles.tileDanger]}>
              <Ionicons name={a.icon} size={24} color={danger ? color.white : color.indigo} />
              {a.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{a.badge > 9 ? "9+" : a.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, danger && { color: color.red }]} numberOfLines={2}>{a.label}</Text>
          </PressScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 14 },
  cell: { alignItems: "center", gap: 7 },
  tile: { width: 54, height: 54, borderRadius: radius.md, backgroundColor: color.indigoTint, alignItems: "center", justifyContent: "center" },
  tileDanger: { backgroundColor: color.red, borderColor: color.red },
  badge: { position: "absolute", top: -6, right: -6, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: color.accentLight, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: color.white },
  badgeText: { fontFamily: font.bodyBold, fontSize: 11, color: color.white },
  label: { fontFamily: font.bodySemi, fontSize: 12.5, color: color.ink, textAlign: "center", lineHeight: 16 },
});
