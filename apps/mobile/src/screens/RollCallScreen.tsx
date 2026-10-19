import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import type { RollSheet } from "../api/client";
import { useRollCall, type RollFilter } from "../features/ops/useRollCall";
import { when } from "../lib/format";
import { color, font, radius, shadow } from "../theme/tokens";
import { Button } from "../ui/Button";
import { Avatar, Chips, Empty, ErrorNote, Loading } from "../ui/bits";
import { FadeIn } from "../ui/motion";
import { Screen } from "../ui/Screen";
import { Text } from "../ui/Text";

type Row = RollSheet["students"][number];

const MARK = {
  PRESENT: { label: "Present", icon: "checkmark-circle", fg: color.green, bg: color.greenSoft },
  ABSENT: { label: "Absent", icon: "close-circle", fg: color.red, bg: color.redSoft },
  ON_PASS: { label: "On pass", icon: "walk", fg: color.indigo, bg: color.indigoTint },
  NONE: { label: "Mark", icon: "ellipse-outline", fg: color.muted, bg: color.field },
} as const;

function Count({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <View style={styles.count}>
      <Text style={[styles.countN, { color: tone }]}>{n}</Text>
      <Text variant="caption" numberOfLines={1}>{label}</Text>
    </View>
  );
}

function StudentRow({ s, onPress }: { s: Row; onPress: () => void }) {
  const m = MARK[s.status ?? "NONE"];
  const sub = s.pass
    ? `${s.pass.overdue ? "Overdue · " : ""}${s.pass.destination} · back ${when(s.pass.returnBy)}`
    : [s.room ? `Room ${s.room}` : null, s.rollNo].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${s.name}, ${m.label}`}
      accessibilityHint={s.status === "ON_PASS" ? "Out on an approved pass" : "Tap to switch between present and absent"}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && s.status !== "ON_PASS" && { opacity: 0.7 }]}
    >
      <Avatar name={s.name} size={42} tone="accent" photoUrl={s.photoUrl} />
      <View style={{ flex: 1 }}>
        <Text variant="label" numberOfLines={1}>{s.name}</Text>
        <Text variant="caption" numberOfLines={1} style={s.pass?.overdue ? { color: color.red } : undefined}>{sub || "—"}</Text>
      </View>
      <View style={[styles.mark, { backgroundColor: m.bg }]}>
        <Ionicons name={m.icon} size={16} color={m.fg} />
        <Text style={[styles.markText, { color: m.fg }]}>{m.label}</Text>
      </View>
    </Pressable>
  );
}

/** Night roll call for wardens: tap each student, then finish. */
export function RollCallScreen({ back }: { back?: boolean }) {
  const vm = useRollCall();
  const s = vm.sheet;
  const c = s?.counts;
  const done = c ? c.total - c.unmarked : 0;
  const filters: { value: RollFilter; label: string }[] = c
    ? [
        { value: "all", label: `All ${c.total}` },
        { value: "unmarked", label: `To mark ${c.unmarked}` },
        { value: "absent", label: `Absent ${c.absent}` },
        { value: "onPass", label: `On pass ${c.onPass}` },
      ]
    : [];

  return (
    <Screen
      title="Roll call"
      eyebrow={s ? `Tonight · ${s.hostel.name}` : "Tonight"}
      back={back}
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      footer={
        s && c && c.total > 0 ? (
          vm.closed ? (
            <Button tone="outline" icon="document-text-outline" label="See reports" onPress={() => router.push("/reports")} />
          ) : (
            <View style={styles.footer}>
              {c.unmarked > 0 ? <Button tone="outline" label="Rest are present" style={{ flex: 1 }} loading={vm.busy} onPress={vm.markRest} /> : null}
              <Button tone="accent" icon="checkmark-done" label={c.unmarked ? `Finish (${c.unmarked} absent)` : "Finish roll call"} style={{ flex: 1.3 }} loading={vm.busy} onPress={vm.close} />
            </View>
          )
        ) : undefined
      }
    >
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}
      {s && s.hostels.length > 1 ? <Chips options={s.hostels.map((h) => ({ value: h.id, label: h.name }))} value={s.hostel.id} onChange={vm.setHostelId} /> : null}
      {s && c ? (
        <FadeIn>
          <View style={[styles.summary, shadow.card]}>
            <View style={styles.counts}>
              <Count n={c.present} label="Present" tone={color.green} />
              <Count n={c.absent} label="Absent" tone={color.red} />
              <Count n={c.onPass} label="On a pass" tone={color.indigo} />
              <Count n={c.unmarked} label="To mark" tone={color.ink} />
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${c.total ? Math.round((done / c.total) * 100) : 0}%` }]} />
            </View>
            {s.rollCall?.closedAt ? (
              <View style={styles.closed}>
                <Ionicons name="checkmark-done-circle" size={18} color={color.green} />
                <Text variant="caption" style={{ flex: 1, color: color.ink }}>
                  Finished {when(s.rollCall.closedAt)} by {s.rollCall.takenByName}.{c.absent ? " Parents of absent students were told." : ""} You can still correct a mark.
                </Text>
              </View>
            ) : (
              <Text variant="caption">Tap a student to mark them present; tap again for absent. Students out on a pass are filled in for you.</Text>
            )}
          </View>
        </FadeIn>
      ) : null}
      {vm.actionError ? <ErrorNote message={vm.actionError} /> : null}
      {s && c && c.total === 0 ? <Empty icon="bed-outline" title="No students in this hostel" body="Import students or assign hostels in People." /> : null}
      {c && c.total > 0 ? <Chips options={filters} value={vm.filter} onChange={vm.setFilter} /> : null}
      {vm.students.length > 0 ? (
        <View style={[styles.list, shadow.card]}>
          {vm.students.map((st, i) => (
            <View key={st.id} style={i > 0 ? styles.divider : undefined}>
              <StudentRow s={st} onPress={() => void vm.toggle(st)} />
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: color.white, borderRadius: radius.lg, padding: 16, gap: 12 },
  counts: { flexDirection: "row" },
  count: { flex: 1, alignItems: "center", gap: 2 },
  countN: { fontFamily: font.display, fontSize: 26 },
  track: { height: 6, borderRadius: 3, backgroundColor: color.field, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: color.accentLight },
  closed: { flexDirection: "row", gap: 8, alignItems: "center", padding: 10, borderRadius: radius.sm, backgroundColor: color.greenSoft },
  list: { backgroundColor: color.white, borderRadius: radius.lg, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  divider: { borderTopWidth: 1, borderTopColor: color.line },
  mark: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 32, borderRadius: radius.pill, minWidth: 92, justifyContent: "center" },
  markText: { fontFamily: font.bodyBold, fontSize: 12.5 },
  footer: { flexDirection: "row", gap: 10 },
});
