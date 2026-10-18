import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/js-tabs";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, radius } from "../theme/tokens";
import { Text } from "./Text";

export type TabDef = { name: string; title: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap };

/** Floating rounded tab bar; the active tab sits in a soft indigo pill with its label. */
function FloatingBar({ state, descriptors, emitter, navigateToTab, tabs }: BottomTabBarProps & { tabs: TabDef[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {state.routes.map((route, i) => {
          const def = tabs.find((t) => t.name === route.name);
          if (!def) return null;
          const focused = state.index === i;
          const label = descriptors[route.key]?.options.title ?? def.title;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                const e = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigateToTab(route.key);
              }}
              style={styles.item}
            >
              <View style={[styles.pill, focused && styles.pillOn]}>
                <Ionicons name={focused ? def.iconOn : def.icon} size={21} color={focused ? color.indigoDeep : color.faint} />
                {focused ? <Text style={styles.label} numberOfLines={1}>{label}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function RoleTabs({ tabs }: { tabs: TabDef[] }) {
  return (
    <Tabs
      tabBar={(props) => <FloatingBar {...props} tabs={tabs} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.ground } }}
    >
      {tabs.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.title }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  outer: { backgroundColor: color.ground, paddingHorizontal: 14, paddingTop: 6 },
  bar: {
    flexDirection: "row",
    backgroundColor: color.white,
    borderRadius: radius.lg + 4,
    padding: 8,
    shadowColor: "#1E1B4B",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  item: { flex: 1, alignItems: "center" },
  pill: { height: 48, minWidth: 48, paddingHorizontal: 12, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  pillOn: { backgroundColor: color.indigoTint },
  label: { fontFamily: font.bodyBold, fontSize: 12.5, color: color.indigoDeep },
});
