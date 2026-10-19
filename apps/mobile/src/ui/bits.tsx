import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";
import { photoSrc } from "../api/client";
import { color, font, radius } from "../theme/tokens";
import { CountUp, FadeIn, ShimmerList } from "./motion";
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

/**
 * Overlapping faces of the people involved (approvers, hosts), as in the
 * design. Extra people collapse into a "+N" bubble.
 */
export function AvatarStack({ people, size = 30, max = 4, ring = color.white }: { people: { name: string; photoUrl?: string | null }[]; size?: number; max?: number; ring?: string }) {
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <View style={{ flexDirection: "row" }} accessibilityLabel={people.map((p) => p.name).join(", ")}>
      {shown.map((p, i) => (
        <View key={`${p.name}-${i}`} style={{ marginLeft: i ? -size * 0.32 : 0, borderRadius: size, borderWidth: 2, borderColor: ring }}>
          <Avatar name={p.name} size={size} photoUrl={p.photoUrl} />
        </View>
      ))}
      {more > 0 ? (
        <View style={{ marginLeft: -size * 0.32, width: size + 4, height: size + 4, borderRadius: size, borderWidth: 2, borderColor: ring, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: font.bodyBold, fontSize: size * 0.36, color: color.white }}>+{more}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The round arrow on tappable cards. `inverse` for use on a brand-coloured card. */
export function ArrowCircle({ inverse, size = 34 }: { inverse?: boolean; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: inverse ? color.white : color.ground, borderWidth: inverse ? 0 : 1, borderColor: color.line }}>
      <Ionicons name="chevron-forward" size={size * 0.5} color={inverse ? color.indigoDeep : color.ink} />
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
            <Text style={[styles.segText, on && { color: color.white }]}>{o.label}</Text>
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
            {o.icon ? <Ionicons name={o.icon} size={15} color={on ? color.white : color.muted} /> : null}
            <Text style={[styles.chipText, on && { color: color.white }]}>{o.label}</Text>
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

/** Placeholder cards that shimmer while a list loads. */
export function Loading({ rows = 3 }: { rows?: number }) {
  return <ShimmerList rows={rows} />;
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
      <Text style={styles.sectionTitle}>{title}</Text>
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
      {typeof value === "number" ? (
        <CountUp value={value} style={{ fontFamily: font.display, fontSize: 26, color: tone === "red" && value !== 0 ? color.red : color.ink }} />
      ) : (
        <Text style={{ fontFamily: font.display, fontSize: 26, color: color.ink }}>{value}</Text>
      )}
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
  seg: { flexDirection: "row", backgroundColor: color.white, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: color.line },
  segItem: { flex: 1, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  segOn: { backgroundColor: color.indigo },
  segText: { fontFamily: font.bodyBold, fontSize: 13.5, color: color.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, backgroundColor: color.white },
  chipOn: { borderColor: color.indigo, backgroundColor: color.indigo },
  chipText: { fontFamily: font.bodySemi, fontSize: 13.5, color: color.muted },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: color.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  error: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: color.redSoft },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  sectionTitle: { fontFamily: font.display, fontSize: 17, color: color.ink, letterSpacing: -0.2 },
  stat: { flex: 1, minWidth: 140, backgroundColor: color.white, borderRadius: radius.lg, padding: 14, gap: 4, shadowColor: "#1E1B4B", shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 1 },
  statIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: color.line },
});
