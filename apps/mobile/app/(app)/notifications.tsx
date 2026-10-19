import Ionicons from "@expo/vector-icons/Ionicons";
import type { NotificationDto } from "@outpassed/shared";
import { Pressable, StyleSheet, View } from "react-native";
import { useInbox } from "../../src/features/notifications/useInbox";
import { relative } from "../../src/lib/format";
import { openFromData } from "../../src/notifications/push";
import { color } from "../../src/theme/tokens";
import { Empty, ErrorNote, Loading } from "../../src/ui/bits";
import { FadeIn } from "../../src/ui/motion";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

const look: Record<string, { icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string }> = {
  OUTPASS_NEEDS_PARENT: { icon: "hourglass-outline", fg: color.amber, bg: color.amberSoft },
  OUTPASS_NEEDS_WARDEN: { icon: "hourglass-outline", fg: color.amber, bg: color.amberSoft },
  OUTPASS_PARENT_APPROVED: { icon: "checkmark-outline", fg: color.green, bg: color.greenSoft },
  OUTPASS_APPROVED: { icon: "ticket-outline", fg: color.accentText, bg: color.accentSoft },
  OUTPASS_REJECTED: { icon: "close-outline", fg: color.red, bg: color.redSoft },
  STUDENT_LEFT: { icon: "arrow-up-outline", fg: color.indigo, bg: color.indigoTint },
  STUDENT_RETURNED: { icon: "arrow-down-outline", fg: color.green, bg: color.greenSoft },
  STUDENT_OVERDUE: { icon: "alarm-outline", fg: color.red, bg: color.redSoft },
  VISITOR_AT_GATE: { icon: "person-outline", fg: color.amber, bg: color.amberSoft },
  VISITOR_ARRIVED: { icon: "person-outline", fg: color.green, bg: color.greenSoft },
  VISIT_DECIDED: { icon: "people-outline", fg: color.indigo, bg: color.indigoTint },
};

export default function Inbox() {
  const vm = useInbox();
  const open = (n: NotificationDto) => {
    void vm.markRead(n);
    openFromData(n.data ?? undefined);
  };
  return (
    <Screen
      title="Alerts"
      eyebrow={vm.unread ? `${vm.unread} unread` : "All caught up"}
      back
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      right={
        vm.unread ? (
          <Pressable onPress={vm.markAllRead} hitSlop={8} accessibilityRole="button">
            <Text variant="label" style={{ color: color.indigo }}>Mark all read</Text>
          </Pressable>
        ) : undefined
      }
    >
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}
      {!vm.loading && vm.items.length === 0 ? (
        <Empty icon="notifications-outline" title="No alerts yet" body="Approvals, gate exits and returns, and visitors at the gate show up here." />
      ) : null}
      {vm.items.map((n, i) => {
        const l = look[n.kind] ?? { icon: "notifications-outline" as const, fg: color.indigo, bg: color.indigoTint };
        return (
          <FadeIn key={n.id} index={i}>
            <Pressable onPress={() => open(n)} accessibilityRole="button" style={[styles.row, !n.readAt && styles.unread]}>
              <View style={[styles.icon, { backgroundColor: l.bg }]}>
                <Ionicons name={l.icon} size={18} color={l.fg} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">{n.title}</Text>
                <Text variant="caption" style={{ color: color.ink }}>{n.body}</Text>
                <Text variant="caption">{relative(n.createdAt)}</Text>
              </View>
              {!n.readAt ? <View style={styles.dot} /> : null}
            </Pressable>
          </FadeIn>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 16, backgroundColor: color.white, borderWidth: 1, borderColor: color.line },
  unread: { borderColor: color.accentLight, backgroundColor: color.accentSoft },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent, marginTop: 6 },
});
