import Ionicons from "@expo/vector-icons/Ionicons";
import type { OutpassDto } from "@outpassed/shared";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { outpassStatus, outpassTypes, studentLine, when } from "../lib/format";
import { color } from "../theme/tokens";
import { Card } from "../ui/Card";
import { ArrowCircle, Avatar } from "../ui/bits";
import { Pill } from "../ui/Pill";
import { Text } from "../ui/Text";

/** One outpass in a list. `showStudent` for parent/warden views. */
export function OutpassCard({ outpass, showStudent }: { outpass: OutpassDto; showStudent?: boolean }) {
  const status = outpassStatus(outpass);
  const type = outpassTypes.find((t) => t.value === outpass.type);
  return (
    <Card onPress={() => router.push(`/outpass/${outpass.id}`)} style={styles.card}>
      {showStudent ? (
        <View style={styles.row}>
          <Avatar name={outpass.student.name} size={38} />
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={1}>{outpass.student.name}</Text>
            <Text variant="caption" numberOfLines={1}>{studentLine(outpass.student) || "Student"}</Text>
          </View>
          <Pill label={status.label} tone={status.tone} />
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.typeIcon}>
            <Ionicons name={type?.icon ?? "navigate-outline"} size={19} color={color.indigo} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={1}>{outpass.destination}</Text>
            <Text variant="caption">{type?.label} outpass</Text>
          </View>
          <Pill label={status.label} tone={status.tone} />
        </View>
      )}
      <View style={styles.foot}>
        <View style={styles.times}>
          <View style={styles.time}>
            <Ionicons name="log-out-outline" size={14} color={color.muted} />
            <Text variant="caption">{when(outpass.leaveAt)}</Text>
          </View>
          <View style={styles.time}>
            <Ionicons name="log-in-outline" size={14} color={outpass.overdue ? color.red : color.muted} />
            <Text variant="caption" style={outpass.overdue ? { color: color.red } : null}>{when(outpass.returnBy)}</Text>
          </View>
        </View>
        <ArrowCircle size={30} />
      </View>
      {outpass.extension?.status === "PENDING" && (outpass.status === "OUT" || outpass.status === "APPROVED") ? (
        <View style={styles.ext}>
          <Ionicons name="time-outline" size={14} color={color.amber} />
          <Text variant="caption" style={{ color: color.amber, flex: 1 }} numberOfLines={1}>
            Asking to return by {when(outpass.extension.requestedReturnBy)}
          </Text>
        </View>
      ) : null}
      {showStudent ? (
        <Text variant="caption" numberOfLines={1} style={{ color: color.ink }}>
          {type?.label} · {outpass.destination} — {outpass.reason}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  typeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.indigoTint, alignItems: "center", justifyContent: "center" },
  foot: { flexDirection: "row", alignItems: "center", gap: 10 },
  times: { flex: 1, flexDirection: "row", gap: 16, flexWrap: "wrap" },
  time: { flexDirection: "row", alignItems: "center", gap: 5 },
  ext: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: color.amberSoft },
});
