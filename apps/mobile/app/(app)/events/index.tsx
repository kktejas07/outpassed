import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import type { EventDto } from "../../../src/api/client";
import { useEvents } from "../../../src/features/campus/useCampus";
import { color, font, radius, shadow } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Empty, ErrorNote, Loading, Segmented } from "../../../src/ui/bits";
import { FadeIn, PressScale } from "../../../src/ui/motion";
import { Pill } from "../../../src/ui/Pill";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const time = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

export function EventRow({ e, index }: { e: EventDto; index: number }) {
  const d = new Date(e.startsAt);
  return (
    <FadeIn index={index}>
      <PressScale onPress={() => router.push(`/events/${e.id}`)} accessibilityRole="button" accessibilityLabel={e.title} style={[styles.row, shadow.card]}>
        <View style={styles.date}>
          <Text style={styles.day}>{d.getDate()}</Text>
          <Text style={styles.mon}>{MONTH[d.getMonth()]}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="eyebrow" numberOfLines={1}>{e.category} · {time(d)}</Text>
          <Text variant="heading" numberOfLines={2}>{e.title}</Text>
          <View style={styles.meta}>
            <Ionicons name="location-outline" size={13} color={color.muted} />
            <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{e.venue}</Text>
          </View>
        </View>
        {e.status !== "APPROVED" ? (
          <Pill label={e.status === "PENDING" ? "In review" : e.status.toLowerCase()} tone={e.status === "PENDING" ? "amber" : "red"} />
        ) : e.registered ? (
          <Ionicons name="checkmark-circle" size={24} color={color.green} />
        ) : e.seatsLeft === 0 ? (
          <Pill label="Full" tone="red" />
        ) : null}
      </PressScale>
    </FadeIn>
  );
}

export default function Events() {
  const vm = useEvents();
  return (
    <Screen
      title="Events"
      eyebrow="Campus"
      back
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      right={<Button compact icon="add" label="Propose" onPress={() => router.push("/events/new")} />}
    >
      <Segmented
        options={[
          { value: "upcoming", label: "Upcoming" },
          { value: "mine", label: "Mine" },
          { value: "past", label: "Past" },
        ]}
        value={vm.scope}
        onChange={vm.setScope}
      />
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}
      {!vm.loading && vm.events.length === 0 ? (
        <Empty
          icon="calendar-outline"
          title={vm.scope === "mine" ? "Nothing yet" : "No events"}
          body={vm.scope === "mine" ? "Events you register for or propose will show here." : "Fests, talks, workshops and club meetups will show here."}
        />
      ) : null}
      {vm.events.map((e, i) => <EventRow key={e.id} e={e} index={i} />)}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: color.white, borderRadius: radius.lg, padding: 14 },
  date: { width: 52, height: 58, borderRadius: 14, backgroundColor: color.indigoTint, alignItems: "center", justifyContent: "center" },
  day: { fontFamily: font.display, fontSize: 21, color: color.indigoDeep, lineHeight: 24 },
  mon: { fontFamily: font.bodyBold, fontSize: 11, color: color.indigo, textTransform: "uppercase", letterSpacing: 0.8 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4 },
});
