import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";
import { photoSrc } from "../api/client";
import { color, font, radius } from "../theme/tokens";
import { FadeIn } from "./motion";
import { Text } from "./Text";

export function Avatar({ name, size = 40, tone = "indigo", photoUrl }: { name: string; size?: number; tone?: "indigo" | "accent"; photoUrl?: string | null }) {
  const src = photoSrc(photoUrl);
  if (src) {
    return (
      <Image
        source={{ uri: src }}
        accessibilityLabel={`Photo of ${name}`}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color.indigoTint, borderWidth: tone === "accent" ? 1.5 : 0, borderColor: color.accentFrame }}
      />
    );
  }
  const initials = name
    .replace(/\(.*?\)/g, "")
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tone === "accent" ? color.accentSoft : color.indigoTint,
        borderWidth: tone === "accent" ? 1.5 : 0,
        borderColor: color.accentFrame,
      }}
    >
      <Text style={{ fontFamily: font.displaySemi, fontSize: size * 0.36, color: tone === "accent" ? color.accentText : color.indigo }}>
        {initials || "?"}
      </Text>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, on && styles.segOn]}
          >
            <Text style={[styles.segText, on && { color: color.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, on && styles.chipOn]}
          >
            {o.icon ? <Ionicons name={o.icon} size={15} color={on ? color.accentText : color.muted} /> : null}
            <Text style={[styles.chipText, on && { color: color.accentText }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Empty({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body?: string }) {
  return (
    <FadeIn style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={color.accent} />
      </View>
      <Text variant="heading" style={{ textAlign: "center" }}>{title}</Text>
      {body ? <Text variant="caption" style={{ textAlign: "center", maxWidth: 260 }}>{body}</Text> : null}
    </FadeIn>
  );
}

export function Loading() {
  return (
    <View style={{ paddingVertical: 48, alignItems: "center" }}>
      <ActivityIndicator color={color.accent} />
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.error}>
      <Ionicons name="alert-circle" size={18} color={color.red} />
      <Text variant="label" style={{ color: color.red, flex: 1 }}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text variant="label" style={{ color: color.indigo }}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.section}>
      <Text variant="eyebrow">{title}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text variant="label" style={{ color: color.indigo }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Stat({ label, value, tone = "ink", icon }: { label: string; value: number | string; tone?: "ink" | "accent" | "red" | "green"; icon: keyof typeof Ionicons.glyphMap }) {
  const fg = { ink: color.indigo, accent: color.accentText, red: color.red, green: color.green }[tone];
  const bg = { ink: color.indigoTint, accent: color.accentSoft, red: color.redSoft, green: color.greenSoft }[tone];
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={16} color={fg} />
      </View>
      <Text style={{ fontFamily: font.display, fontSize: 26, color: tone === "red" && value !== 0 ? color.red : color.ink }}>{value}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text variant="caption">{label}</Text>
      <Text variant="label" style={{ flexShrink: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: "row", backgroundColor: "#F1F0F7", borderRadius: radius.md, padding: 4 },
  segItem: { flex: 1, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  segOn: { backgroundColor: color.white, shadowColor: "#1E1B4B", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  segText: { fontFamily: font.bodyBold, fontSize: 13.5, color: color.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, backgroundColor: color.white },
  chipOn: { borderColor: color.accentFrame, backgroundColor: color.accentSoft },
  chipText: { fontFamily: font.bodySemi, fontSize: 13.5, color: color.muted },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: color.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  error: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: color.redSoft },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  stat: { flex: 1, minWidth: 140, backgroundColor: color.white, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: 14, gap: 4 },
  statIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: color.line },
});
