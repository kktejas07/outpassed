import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useEventDetail } from "../../../src/features/campus/useCampus";
import { color, font, radius, shadow } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { ErrorNote, KeyValue, Loading } from "../../../src/ui/bits";
import { Bounce, CountUp, FadeIn, PopIn } from "../../../src/ui/motion";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useEventDetail(id);
  const e = vm.event;
  if (!e) return <Screen title="Event" back>{vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : <Loading rows={1} />}</Screen>;
  const full = e.seatsLeft === 0 && !e.registered;
  return (
    <Screen
      title={e.title}
      eyebrow={e.category}
      back
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      footer={
        e.status === "APPROVED" ? (
          e.registered ? (
            <Button tone="outline" icon="close-circle-outline" label="Cancel my registration" loading={vm.busy} onPress={vm.unregister} />
          ) : (
            <Button icon="checkmark-circle-outline" label={full ? "Event is full" : e.registrationOpen ? "Register" : "Registration closed"} disabled={full || !e.registrationOpen} loading={vm.busy} onPress={vm.register} />
          )
        ) : undefined
      }
    >
      {e.status === "PENDING" ? (
        <View style={styles.review}>
          <Ionicons name="hourglass-outline" size={18} color={color.amber} />
          <Text variant="caption" style={{ flex: 1, color: color.ink }}>An admin is reviewing this event. Students will be told once it's approved.</Text>
        </View>
      ) : e.status === "REJECTED" ? (
        <View style={[styles.review, { backgroundColor: color.redSoft }]}>
          <Ionicons name="close-circle" size={18} color={color.red} />
          <Text variant="caption" style={{ flex: 1, color: color.ink }}>Not approved{e.rejectReason ? `: ${e.rejectReason}` : ""}.</Text>
        </View>
      ) : null}
      {e.registered ? (
        <PopIn style={[styles.going, shadow.card]}>
          <Bounce><Ionicons name="checkmark-circle" size={36} color={color.green} /></Bounce>
          <View style={{ flex: 1 }}>
            <Text variant="heading">You're going</Text>
            <Text variant="caption">Show up a few minutes early. You'll get a reminder.</Text>
          </View>
        </PopIn>
      ) : null}
      <FadeIn>
        <View style={styles.stats}>
          <View style={[styles.stat, shadow.card]}>
            <CountUp value={e.registrations} style={styles.statN} />
            <Text variant="caption">registered</Text>
          </View>
          <View style={[styles.stat, shadow.card]}>
            {e.seatsLeft === null ? <Text style={styles.statN}>Open</Text> : <CountUp value={e.seatsLeft} style={[styles.statN, e.seatsLeft < 10 && { color: color.red }]} />}
            <Text variant="caption">{e.seatsLeft === null ? "no seat limit" : "seats left"}</Text>
          </View>
        </View>
      </FadeIn>
      <FadeIn index={1}>
        <Card style={{ paddingVertical: 6 }}>
          <KeyValue label="Starts" value={when(e.startsAt)} />
          <KeyValue label="Ends" value={when(e.endsAt)} />
          <KeyValue label="Where" value={e.venue} />
          <KeyValue label="Organised by" value={e.organizer.name} />
        </Card>
      </FadeIn>
      <FadeIn index={2}>
        <Card>
          <Text variant="body" style={{ color: color.ink }}>{e.description}</Text>
        </Card>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  review: { flexDirection: "row", gap: 10, alignItems: "center", padding: 14, borderRadius: radius.md, backgroundColor: color.amberSoft },
  going: { flexDirection: "row", gap: 12, alignItems: "center", padding: 16, borderRadius: radius.lg, backgroundColor: color.greenSoft },
  stats: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, backgroundColor: color.white, borderRadius: radius.lg, padding: 16, alignItems: "center" },
  statN: { fontFamily: font.display, fontSize: 28, color: color.ink },
});
