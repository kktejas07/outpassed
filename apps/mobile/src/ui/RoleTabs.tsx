import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/js-tabs";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, radius } from "../theme/tokens";
import { Text } from "./Text";

export type TabDef = { name: string; title: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap };

/** Floating brand-coloured tab bar: icon with its name under it; the active icon sits in a white pill. */
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
              <TabPill focused={focused} icon={focused ? def.iconOn : def.icon} label={label} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The pill grows in behind the active tab, and its icon gives a small hop. */
function TabPill({ focused, icon, label }: { focused: boolean; icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: focused ? 1 : 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (focused) {
      hop.setValue(0);
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(hop, { toValue: 0, friction: 4, tension: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [focused, v, hop]);
  return (
    <View style={styles.tab}>
      <View style={styles.pill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.pillOn, { opacity: v, transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]} />
        <Animated.View style={{ transform: [{ translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }}>
          <Ionicons name={icon} size={20} color={focused ? color.indigoDeep : "rgba(255,255,255,0.8)"} />
        </Animated.View>
      </View>
      {/* Every tab keeps its name under the icon, so no icon has to explain itself. */}
      <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>{label}</Text>
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
    backgroundColor: color.indigo,
    borderRadius: radius.pill,
    paddingVertical: 8, paddingHorizontal: 6,
    shadowColor: "#3730A3",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  item: { flex: 1, alignItems: "center" },
  tab: { alignItems: "center", gap: 3, paddingVertical: 2 },
  pill: { height: 32, width: 52, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  pillOn: { backgroundColor: color.white, borderRadius: radius.pill },
  label: { fontFamily: font.bodySemi, fontSize: 11, color: "rgba(255,255,255,0.78)" },
  labelOn: { fontFamily: font.bodyBold, color: color.white },
});
