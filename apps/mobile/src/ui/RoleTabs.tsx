import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/js-tabs";
import { color, font } from "../theme/tokens";

export type TabDef = { name: string; title: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap };

/** Bottom tabs in the Arvio style: white bar, gold active state. */
export function RoleTabs({ tabs }: { tabs: TabDef[] }) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.goldText,
        tabBarInactiveTintColor: color.faint,
        tabBarStyle: { backgroundColor: color.white, borderTopColor: color.line, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: font.bodyBold, fontSize: 11 },
        sceneStyle: { backgroundColor: color.ground },
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ focused, color: c, size }) => <Ionicons name={focused ? t.iconOn : t.icon} size={size - 2} color={(c as string) ?? color.faint} />,
          }}
        />
      ))}
    </Tabs>
  );
}
