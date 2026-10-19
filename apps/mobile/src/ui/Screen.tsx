import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, radius } from "../theme/tokens";
import { Bell } from "./Bell";
import { Mark } from "./Mark";
import { Text } from "./Text";

export type Hero = {
  /** Small line above the name, e.g. "Good morning,". */
  greeting: string;
  /** Large line, e.g. the person's name or the screen's purpose. */
  title: string;
  /** Status chip under the title, e.g. "On campus · Block C, 214". */
  chip?: { label: string; tone?: "safe" | "warn" | "danger" | "info" };
};

const CHIP_DOT = { safe: color.accentLight, warn: "#FBBF24", danger: "#F87171", info: color.headSub } as const;

/** Soft rings in the header band, as in the design. Purely decorative. */
function Rings({ big }: { big?: boolean }) {
  const s = big ? 300 : 190;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.ring, { width: s, height: s, borderRadius: s / 2, top: big ? -90 : -80, right: big ? -110 : -70 }]} />
      <View style={[styles.ringDash, { width: s * 0.72, height: s * 0.72, borderRadius: s * 0.36, top: big ? -46 : -52, right: big ? -64 : -40 }]} />
    </View>
  );
}

/**
 * Page shell. Detail screens get a compact indigo header band; home screens
 * pass `hero` for the tall band with greeting and status chip, which scrolls
 * with the page while the first card overlaps it.
 */
export function Screen({
  title,
  eyebrow,
  back,
  right,
  children,
  footer,
  refreshing,
  onRefresh,
  scroll = true,
  bell,
  hero,
}: {
  title?: string;
  eyebrow?: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  /** Show the alerts bell in the header. */
  bell?: boolean;
  hero?: Hero;
}) {
  const insets = useSafeAreaInsets();
  const backButton = back ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={10}
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      style={styles.back}
    >
      <Ionicons name="chevron-back" size={22} color={color.white} />
    </Pressable>
  ) : null;

  const heroBand = hero ? (
    <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
      <Rings big />
      <View style={styles.headerRow}>
        {backButton}
        <View style={styles.brand}>
          <Mark size={34} />
          <Text style={styles.brandText}>outpass</Text>
        </View>
        {right}
        {bell ? <Bell /> : null}
      </View>
      <View style={{ gap: 4, marginTop: 22 }}>
        <Text style={styles.greeting}>{hero.greeting}</Text>
        <Text style={styles.heroTitle} numberOfLines={2}>{hero.title}</Text>
      </View>
      {hero.chip ? (
        <View style={styles.chip}>
          <View style={[styles.chipDot, { backgroundColor: CHIP_DOT[hero.chip.tone ?? "safe"] }]} />
          <Text style={styles.chipText} numberOfLines={1}>{hero.chip.label}</Text>
        </View>
      ) : null}
    </View>
  ) : null;

  const header = !hero && title ? (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <Rings />
      <View style={styles.headerRow}>
        {backButton}
        <View style={{ flex: 1 }}>
          {eyebrow ? <Text variant="eyebrow" style={{ color: color.headSub }}>{eyebrow}</Text> : null}
          <Text variant="title" numberOfLines={1} style={{ color: color.white }}>{title}</Text>
        </View>
        {right}
        {bell ? <Bell /> : null}
      </View>
    </View>
  ) : !hero ? (
    <View style={{ height: insets.top }} />
  ) : null;

  const content = <View style={[styles.content, hero && styles.overlap]}>{children}</View>;

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ paddingBottom: footer ? 24 : insets.bottom + 32 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={hero ? color.white : color.indigo} /> : undefined}
    >
      {heroBand}
      {content}
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }}>
      {heroBand}
      {content}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style={title || hero ? "light" : "dark"} />
      {hero ? <View style={{ height: 0 }} /> : header}
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  header: { backgroundColor: color.head, paddingHorizontal: 20, paddingBottom: 18, overflow: "hidden" },
  hero: { backgroundColor: color.head, paddingHorizontal: 22, paddingBottom: 74, overflow: "hidden" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brand: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  brandText: { fontFamily: font.display, fontSize: 21, color: color.white, letterSpacing: -0.4 },
  greeting: { fontFamily: font.body, fontSize: 16, color: color.headSub },
  heroTitle: { fontFamily: font.display, fontSize: 31, lineHeight: 37, color: color.white, letterSpacing: -0.6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", marginTop: 16, paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontFamily: font.bodyBold, fontSize: 14, color: color.white },
  ring: { position: "absolute", backgroundColor: "rgba(99,102,241,0.14)" },
  ringDash: { position: "absolute", borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(165,180,252,0.35)" },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 14 },
  overlap: { marginTop: -56, paddingTop: 0 },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: color.white, borderTopWidth: 1, borderTopColor: color.line, gap: 10 },
});
