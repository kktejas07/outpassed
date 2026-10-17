import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { api } from "../../../src/api/client";
import { time, when } from "../../../src/lib/format";
import { useQuery } from "../../../src/lib/useQuery";
import { color } from "../../../src/theme/tokens";
import { Card } from "../../../src/ui/Card";
import { Empty, ErrorNote, Loading } from "../../../src/ui/bits";
import { FadeIn } from "../../../src/ui/motion";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

export default function GateLog() {
  const q = useQuery((t) => api.listEvents(t, 60));
  const events = q.data ?? [];
  return (
    <Screen title="Gate log" eyebrow="Recent movements" refreshing={q.refreshing} onRefresh={q.refresh}>
      {q.error ? <ErrorNote message={q.error} onRetry={q.refresh} /> : null}
      {q.loading ? <Loading /> : null}
      {!q.loading && events.length === 0 ? <Empty icon="list-outline" title="No movements yet" /> : null}
      {events.map((e, i) => {
        const exit = e.direction === "EXIT";
        const tone = !e.accepted ? color.red : exit ? color.indigo : color.green;
        return (
          <FadeIn key={e.id} index={i}>
            <Card style={styles.row}>
              <View style={[styles.icon, { backgroundColor: !e.accepted ? color.redSoft : exit ? color.indigoTint : color.greenSoft }]}>
                <Ionicons name={!e.accepted ? "hand-left-outline" : exit ? "arrow-up-outline" : "arrow-down-outline"} size={18} color={tone} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label">{e.personName}</Text>
                <Text variant="caption" numberOfLines={1}>
                  {!e.accepted ? "Turned back" : exit ? "Left" : "Entered"} · {e.visitId ? "Visitor" : "Student"} · {e.gate}
                  {e.method === "MANUAL" ? " · manual" : ""}
                </Text>
              </View>
              <Text variant="caption" accessibilityLabel={when(e.createdAt)}>{time(e.createdAt)}</Text>
            </Card>
          </FadeIn>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
