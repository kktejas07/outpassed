import Ionicons from "@expo/vector-icons/Ionicons";
import type { VisitDto } from "@outpassed/shared";
import { StyleSheet, View } from "react-native";
import { visitorTypes, visitStatus, when } from "../lib/format";
import { color } from "../theme/tokens";
import { Card } from "../ui/Card";
import { Avatar } from "../ui/bits";
import { Pill } from "../ui/Pill";
import { Text } from "../ui/Text";

export function VisitCard({ visit, onPress, children }: { visit: VisitDto; onPress?: () => void; children?: React.ReactNode }) {
  const s = visitStatus(visit);
  const type = visitorTypes.find((t) => t.value === visit.visitorType)?.label ?? visit.visitorType;
  return (
    <Card onPress={onPress} accent={s.tone === "amber" ? "#F59E0B" : undefined} style={{ gap: 10 }}>
      <View style={styles.row}>
        <Avatar name={visit.visitorName} size={38} tone="accent" />
        <View style={{ flex: 1 }}>
          <Text variant="heading" numberOfLines={1}>{visit.visitorName}</Text>
          <Text variant="caption" numberOfLines={1}>{type}{visit.walkIn ? " · walk-in" : ""} · meeting {visit.host.name}</Text>
        </View>
        <Pill label={s.label} tone={s.tone} />
      </View>
      <View style={styles.row}>
        <Ionicons name="chatbubble-ellipses-outline" size={14} color={color.muted} />
        <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>{visit.purpose}</Text>
      </View>
      <View style={styles.row}>
        <Ionicons name="time-outline" size={14} color={color.muted} />
        <Text variant="caption">{when(visit.validFrom)} → {when(visit.validTo)}</Text>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
