import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color } from "../theme/tokens";
import { Text } from "./Text";

/** Page shell: safe area, white header, scrolling body with pull-to-refresh. */
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
}) {
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.headerRow}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={22} color={color.ink} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
          <Text variant="title" numberOfLines={1}>{title}</Text>
        </View>
        {right}
      </View>
    </View>
  ) : (
    <View style={{ height: insets.top }} />
  );

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: footer ? 24 : insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={color.gold} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {header}
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  header: { backgroundColor: color.white, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: color.line },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.ground, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 14 },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: color.white, borderTopWidth: 1, borderTopColor: color.line, gap: 10 },
});
