import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../auth/session";
import { color, font, radius } from "../theme/tokens";
import { Avatar } from "./bits";
import { Bell } from "./Bell";
import { Text } from "./Text";

export type Hero = {
  /** Small line next to the avatar, e.g. "Good morning,". */
  greeting: string;
  /** The person's name or the place, e.g. "Asha Rao" or "Main Gate". */
  title: string;
  /**
   * The big title under the header row. Put a line break in it for the
   * two-tone look: the first line in ink, the second in the brand colour,
   * e.g. "Plan your\nnext outpass". Falls back to `title` when it isn't the
   * person's own name.
   */
  headline?: string;
  /** Status chip under the title, e.g. "On campus · Block C, 214". */
  chip?: { label: string; tone?: "safe" | "warn" | "danger" | "info" };
};

const CHIP = {
  safe: { dot: color.accentLight, bg: color.accentSoft, fg: color.accentText },
  warn: { dot: "#F59E0B", bg: color.amberSoft, fg: color.amber },
  danger: { dot: color.red, bg: color.redSoft, fg: color.red },
  info: { dot: color.indigo, bg: color.indigoTint, fg: color.indigoDeep },
} as const;

/** Round outlined button used for Back (and matched by the alerts bell). */
function CircleButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress} style={styles.circle}>
      <Ionicons name={icon} size={20} color={color.ink} />
    </Pressable>
  );
}

/** Big title; a "\n" splits it into an ink line and a brand-coloured line. */
function Headline({ text }: { text: string }) {
  const [first, ...rest] = text.split("\n");
  return (
    <Text style={styles.headline} accessibilityRole="header">
      {first}
      {rest.length ? <Text style={[styles.headline, { color: color.indigo }]}>{`\n${rest.join(" ")}`}</Text> : null}
    </Text>
  );
}

/**
 * Page shell, white and quiet so the one bold brand card on each screen
 * stands out. Home screens pass `hero`: avatar, greeting, bell, then a big
 * two-tone title and a status chip. Detail screens get a compact header with
 * a round Back button.
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
  const { user } = useSession();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const backButton = back ? <CircleButton icon="chevron-back" label="Back" onPress={goBack} /> : null;

  const isName = !!hero && !!user && hero.title === user.name;
  const headline = hero ? hero.headline ?? (isName ? null : hero.title) : null;

  const heroBlock = hero ? (
    <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
      <View style={styles.headerRow}>
        {backButton}
        {user ? <Avatar name={user.name} size={44} photoUrl={user.photoUrl} /> : null}
        <View style={{ flex: 1 }}>
          <Text variant="caption" numberOfLines={1}>{hero.greeting.replace(/,$/, "")}</Text>
          <Text style={styles.who} numberOfLines={1}>{isName || !user ? hero.title : user.name}</Text>
        </View>
        {right}
        {bell ? <Bell /> : null}
      </View>
      {headline ? <Headline text={headline} /> : null}
      {hero.chip ? (
        <View style={[styles.chip, { backgroundColor: CHIP[hero.chip.tone ?? "safe"].bg }]}>
          <View style={[styles.chipDot, { backgroundColor: CHIP[hero.chip.tone ?? "safe"].dot }]} />
          <Text style={[styles.chipText, { color: CHIP[hero.chip.tone ?? "safe"].fg }]} numberOfLines={1}>{hero.chip.label}</Text>
        </View>
      ) : null}
    </View>
  ) : null;

  const header = !hero && title ? (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.headerRow}>
        {backButton}
        <View style={{ flex: 1 }}>
          {eyebrow ? <Text variant="caption" numberOfLines={1}>{eyebrow}</Text> : null}
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        {right}
        {bell ? <Bell /> : null}
      </View>
    </View>
  ) : !hero ? (
    <View style={{ height: insets.top }} />
  ) : null;

  const content = <View style={styles.content}>{children}</View>;

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ paddingBottom: footer ? 24 : insets.bottom + 32 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={color.indigo} /> : undefined}
    >
      {heroBlock}
      {content}
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }}>
      {heroBlock}
      {content}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="dark" />
      {hero ? null : header}
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  header: { backgroundColor: color.ground, paddingHorizontal: 20, paddingBottom: 6 },
  hero: { paddingHorizontal: 20, paddingBottom: 4, gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  who: { fontFamily: font.display, fontSize: 17, color: color.ink, letterSpacing: -0.2 },
  title: { fontFamily: font.display, fontSize: 21, color: color.ink, letterSpacing: -0.3 },
  headline: { fontFamily: font.display, fontSize: 30, lineHeight: 36, color: color.ink, letterSpacing: -0.7 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingHorizontal: 14, height: 34, borderRadius: radius.pill },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontFamily: font.bodyBold, fontSize: 13.5 },
  circle: { width: 42, height: 42, borderRadius: 21, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingTop: 14, gap: 14 },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: color.white, borderTopWidth: 1, borderTopColor: color.line, gap: 10 },
});
