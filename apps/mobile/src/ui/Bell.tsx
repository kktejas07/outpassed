import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useUnreadCount } from "../features/notifications/useInbox";
import { color, font } from "../theme/tokens";
import { Text } from "./Text";

/** Header bell that opens the inbox; shows a gold badge with the unread count. */
export function Bell() {
  const unread = useUnreadCount();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Alerts, ${unread} unread` : "Alerts"}
      hitSlop={8}
      onPress={() => router.push("/notifications")}
      style={styles.btn}
    >
      <Ionicons name={unread ? "notifications" : "notifications-outline"} size={21} color={color.ink} />
      {unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.ground, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 3, right: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: color.gold, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: color.white },
  badgeText: { fontFamily: font.bodyBold, fontSize: 10, color: color.white, lineHeight: 12 },
});
