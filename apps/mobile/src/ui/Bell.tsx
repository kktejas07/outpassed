import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useUnreadCount } from "../features/notifications/useInbox";
import { color, font } from "../theme/tokens";
import { Text } from "./Text";

/** Header bell that opens the inbox; shows a accent badge with the unread count. */
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
      <Ionicons name={unread ? "notifications" : "notifications-outline"} size={20} color={color.ink} />
      {unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 42, height: 42, borderRadius: 21, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 3, right: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: color.indigo, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: color.white },
  badgeText: { fontFamily: font.bodyBold, fontSize: 10, color: color.white, lineHeight: 12 },
});
