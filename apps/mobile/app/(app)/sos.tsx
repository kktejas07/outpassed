import Ionicons from "@expo/vector-icons/Ionicons";
import type { SosDto } from "@outpassed/shared";
import { useState } from "react";
import { Animated, Linking, Pressable, StyleSheet, View } from "react-native";
import { sosKinds, useSos } from "../../src/features/sos/useSos";
import { relative, when } from "../../src/lib/format";
import { color, font, radius } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Empty, ErrorNote, Loading, SectionTitle } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn, PopIn, usePulse } from "../../src/ui/motion";
import { Pill } from "../../src/ui/Pill";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

const LABEL = { MEDICAL: "Medical", SAFETY: "Safety", OTHER: "Help needed" } as const;

function Steps({ a }: { a: SosDto }) {
  const steps = [
    { done: true, title: "Alert sent", detail: when(a.createdAt) },
    { done: !!a.acknowledgedAt, title: a.acknowledgedAt ? `${a.acknowledgedByName} is responding` : "Waiting for staff", detail: a.acknowledgedAt ? when(a.acknowledgedAt) : "Wardens and guards have been alerted" },
    { done: a.status === "RESOLVED", title: a.status === "RESOLVED" ? "Closed" : "Closed when handled", detail: a.resolution ?? (a.resolvedAt ? when(a.resolvedAt) : "") },
  ];
  return (
    <View style={{ gap: 12 }}>
      {steps.map((s) => (
        <View key={s.title} style={{ flexDirection: "row", gap: 10 }}>
          <Ionicons name={s.done ? "checkmark-circle" : "ellipse-outline"} size={20} color={s.done ? color.green : color.faint} />
          <View style={{ flex: 1 }}>
            <Text variant="label">{s.title}</Text>
            {s.detail ? <Text variant="caption">{s.detail}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function StudentSos({ vm }: { vm: ReturnType<typeof useSos> }) {
  const pulse = usePulse(true);
  const [armed, setArmed] = useState(false);
  if (vm.loading) return <Loading />;
  if (vm.mine) {
    return (
      <PopIn style={{ gap: 14 }}>
        <Card style={{ gap: 14, borderColor: color.red }}>
          <View style={styles.row}>
            <Ionicons name="alert-circle" size={26} color={color.red} />
            <Text variant="title" style={{ color: color.red, flex: 1 }}>{LABEL[vm.mine.kind]} alert is active</Text>
          </View>
          <Steps a={vm.mine} />
        </Card>
        <Text variant="caption" style={{ textAlign: "center" }}>Stay where you are if it's safe. Keep your phone with you.</Text>
        <Button tone="outline" label="I'm okay now — cancel alert" loading={vm.acting} onPress={() => void vm.resolve(vm.mine!)} />
      </PopIn>
    );
  }
  return (
    <FadeIn style={{ gap: 14 }}>
      <Text variant="body" style={{ color: color.muted }}>This alerts every warden and guard on duty at once with your name, room and phone number.</Text>
      {sosKinds.map((k) => {
        const on = vm.kind === k.value;
        return (
          <Pressable key={k.value} onPress={() => vm.setKind(k.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.kind, on && styles.kindOn]}>
            <Ionicons name={k.icon} size={22} color={on ? color.red : color.muted} />
            <View style={{ flex: 1 }}>
              <Text variant="label" style={on ? { color: color.red } : null}>{k.label}</Text>
              <Text variant="caption">{k.hint}</Text>
            </View>
            <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? color.red : color.faint} />
          </Pressable>
        );
      })}
      <Field label="Anything they should know? (optional)" value={vm.note} onChangeText={vm.setNote} placeholder="e.g. Near the Block C stairs" />
      {vm.raiseError ? <ErrorNote message={vm.raiseError} /> : null}
      <View style={{ alignItems: "center", paddingVertical: 8 }}>
        <Animated.View style={[styles.halo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.05] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }] }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={armed ? "Tap again to send SOS" : "Send SOS"}
          onPress={() => (armed ? void vm.raise() : setArmed(true))}
          style={styles.big}
        >
          <Text style={styles.bigText}>{vm.raising ? "Sending…" : armed ? "Tap again" : "SOS"}</Text>
          <Text style={styles.bigSub}>{armed ? "to send the alert" : "Tap to send"}</Text>
        </Pressable>
      </View>
      {armed ? <Button tone="ghost" label="Cancel" onPress={() => setArmed(false)} /> : null}
    </FadeIn>
  );
}

function StaffSos({ vm }: { vm: ReturnType<typeof useSos> }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (vm.loading) return <Loading />;
  return (
    <>
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.actError ? <ErrorNote message={vm.actError} /> : null}
      {vm.open.length === 0 ? <Empty icon="shield-checkmark-outline" title="No open alerts" body="When someone presses SOS, it appears here and on every warden's and guard's phone." /> : null}
      {vm.open.map((a, i) => (
        <PopIn key={a.id}>
          <Card style={{ gap: 12, borderColor: color.red }} accent={color.red}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text variant="eyebrow" style={{ color: color.red }}>{LABEL[a.kind]} · {relative(a.createdAt)}</Text>
                <Text variant="title">{a.raisedBy.name}</Text>
                <Text variant="caption">{[a.raisedBy.rollNo, a.raisedBy.hostel, a.raisedBy.room ? `Room ${a.raisedBy.room}` : null].filter(Boolean).join(" · ")}</Text>
              </View>
              <Pill label={a.status === "OPEN" ? "No response yet" : "Responding"} tone={a.status === "OPEN" ? "red" : "amber"} />
            </View>
            {a.note ? <Text variant="body">“{a.note}”</Text> : null}
            {a.acknowledgedByName ? <Text variant="caption">{a.acknowledgedByName} responded {a.acknowledgedAt ? relative(a.acknowledgedAt) : ""}</Text> : null}
            {a.raisedBy.phone ? (
              <Button compact tone="outline" icon="call-outline" label={`Call ${a.raisedBy.phone}`} onPress={() => void Linking.openURL(`tel:${a.raisedBy.phone}`)} />
            ) : null}
            {a.status === "OPEN" ? (
              <Button tone="danger" icon="walk-outline" label="I'm responding" loading={vm.acting} onPress={() => void vm.acknowledge(a)} />
            ) : (
              <View style={{ gap: 8 }}>
                <Field label="What happened? (optional)" value={notes[a.id] ?? ""} onChangeText={(t) => setNotes((n) => ({ ...n, [a.id]: t }))} placeholder="e.g. Taken to the campus clinic" />
                <Button tone="success" icon="checkmark" label="Mark handled" loading={vm.acting} onPress={() => void vm.resolve(a, notes[a.id]?.trim() || undefined)} />
              </View>
            )}
          </Card>
          {i < vm.open.length - 1 ? <View style={{ height: 4 }} /> : null}
        </PopIn>
      ))}
      {vm.closed.length ? <SectionTitle title="Closed in the last 24 hours" /> : null}
      {vm.closed.map((a, i) => (
        <FadeIn key={a.id} index={i}>
          <Card style={styles.row}>
            <Ionicons name="checkmark-circle" size={20} color={color.green} />
            <View style={{ flex: 1 }}>
              <Text variant="label">{LABEL[a.kind]} · {a.raisedBy.name}</Text>
              <Text variant="caption" numberOfLines={2}>{a.resolution ?? `Closed by ${a.resolvedByName ?? "staff"}`} · {a.resolvedAt ? relative(a.resolvedAt) : ""}</Text>
            </View>
          </Card>
        </FadeIn>
      ))}
    </>
  );
}

export default function SosScreen() {
  const vm = useSos();
  return (
    <Screen title={vm.staff ? "SOS alerts" : "Emergency"} eyebrow={vm.staff ? `${vm.open.length} open` : "SOS"} back refreshing={vm.refreshing} onRefresh={vm.refresh}>
      {vm.staff ? <StaffSos vm={vm} /> : <StudentSos vm={vm} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  kind: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, backgroundColor: color.white },
  kindOn: { borderColor: color.red, backgroundColor: color.redSoft },
  big: { width: 168, height: 168, borderRadius: 84, backgroundColor: color.red, alignItems: "center", justifyContent: "center", shadowColor: color.red, shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  halo: { position: "absolute", top: 8, width: 168, height: 168, borderRadius: 84, backgroundColor: color.red },
  bigText: { fontFamily: font.display, fontSize: 34, color: color.white, letterSpacing: 1 },
  bigSub: { fontFamily: font.bodySemi, fontSize: 12.5, color: "rgba(255,255,255,0.9)" },
});
