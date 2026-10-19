import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { photoSrc, type TicketStatus } from "../../../src/api/client";
import { useSession } from "../../../src/auth/session";
import { TICKET_ICON, TICKET_STATUS, useTicket } from "../../../src/features/helpdesk/useHelpdesk";
import { relative, when } from "../../../src/lib/format";
import { color, font, radius } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { ErrorNote, KeyValue, Loading } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn } from "../../../src/ui/motion";
import { Pill } from "../../../src/ui/Pill";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

/** One helpdesk request: what was reported, every update, and the next step. */
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const vm = useTicket(id);
  const [note, setNote] = useState("");
  const t = vm.ticket;
  const staff = user?.role === "WARDEN" || user?.role === "ADMIN";

  if (!t) {
    return (
      <Screen title="Request" eyebrow="Helpdesk" back>
        {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : <Loading />}
      </Screen>
    );
  }

  const s = TICKET_STATUS[t.status];
  const go = async (status: TicketStatus | undefined, done: string) => {
    if (await vm.update(note.trim(), status, done)) setNote("");
  };
  const closed = t.status === "CLOSED";

  // The next step depends on who's looking and where the request is.
  const actions = staff ? (
    closed ? null : (
      <View style={styles.actions}>
        {t.status === "OPEN" ? <Button compact tone="outline" icon="construct-outline" label="Start fixing" style={{ flex: 1 }} loading={vm.busy} onPress={() => void go("IN_PROGRESS", "Marked as being fixed")} /> : null}
        {t.status !== "RESOLVED" ? (
          <Button compact tone="success" icon="checkmark" label="Mark fixed" style={{ flex: 1 }} loading={vm.busy} disabled={note.trim().length < 3} onPress={() => void go("RESOLVED", "Marked fixed; the student has been told")} />
        ) : null}
      </View>
    )
  ) : t.status === "RESOLVED" ? (
    <View style={styles.actions}>
      {t.canReopen ? <Button compact tone="outline" icon="refresh" label="Still a problem" style={{ flex: 1 }} loading={vm.busy} onPress={() => void go("OPEN", "Reopened; the warden has been told")} /> : null}
      <Button compact tone="success" icon="checkmark-done" label="It's fixed" style={{ flex: 1 }} loading={vm.busy} onPress={() => void go("CLOSED", "Thanks; request closed")} />
    </View>
  ) : null;

  return (
    <Screen
      title={`Request #${t.number}`}
      eyebrow={t.category}
      back
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      footer={
        closed ? undefined : (
          <View style={{ gap: 10 }}>
            <Field
              label={staff ? "Note for the student" : "Add a note"}
              value={note}
              onChangeText={setNote}
              placeholder={staff ? (t.status === "RESOLVED" ? "Anything else they should know" : "What's been done, or when someone will come") : "Anything the warden should know"}
            />
            {vm.actionError ? <ErrorNote message={vm.actionError} /> : null}
            {actions}
            <Button compact tone="ghost" label="Send note" disabled={note.trim().length < 2 || vm.busy} onPress={() => void go(undefined, "Note sent")} />
          </View>
        )
      }
    >
      <FadeIn>
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <View style={styles.icon}><Ionicons name={TICKET_ICON[t.category] ?? "help-circle"} size={22} color={color.white} /></View>
            <View style={{ flex: 1 }}>
              <Text variant="heading">{t.title}</Text>
              <Text variant="caption">Reported {relative(t.createdAt)}</Text>
            </View>
            <Pill label={s.label} tone={s.tone} />
          </View>
          <Text variant="body">{t.details}</Text>
          {photoSrc(t.photoUrl) ? <Image source={{ uri: photoSrc(t.photoUrl)! }} style={styles.photo} accessibilityLabel="Photo of the problem" /> : null}
          <View>
            {staff ? <KeyValue label="Student" value={[t.student.name, t.student.rollNo].filter(Boolean).join(" · ")} /> : null}
            {t.location ? <KeyValue label="Where" value={t.location} /> : null}
            {t.hostel ? <KeyValue label="Hostel" value={t.hostel.name} /> : null}
            <KeyValue label="Handled by" value={t.assignedTo?.name ?? "Not picked up yet"} />
          </View>
        </Card>
      </FadeIn>

      {t.history.length ? (
        <FadeIn index={1}>
          <Card style={{ gap: 0 }}>
            <Text style={styles.histTitle}>Updates</Text>
            {t.history.map((h, i) => (
              <View key={h.id} style={styles.hist}>
                <View style={styles.rail}>
                  <View style={[styles.dot, h.status ? { backgroundColor: h.status === "RESOLVED" || h.status === "CLOSED" ? color.accentLight : color.indigo } : null]} />
                  {i < t.history.length - 1 ? <View style={styles.line} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 14, gap: 2 }}>
                  <Text variant="label">{h.author.name}{h.status ? ` · ${TICKET_STATUS[h.status].label.toLowerCase()}` : ""}</Text>
                  <Text variant="body">{h.body}</Text>
                  <Text variant="caption">{when(h.at)}</Text>
                </View>
              </View>
            ))}
          </Card>
        </FadeIn>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 23, backgroundColor: color.indigo, alignItems: "center", justifyContent: "center" },
  photo: { width: "100%", height: 200, borderRadius: radius.md, backgroundColor: color.ground },
  actions: { flexDirection: "row", gap: 10 },
  histTitle: { fontFamily: font.display, fontSize: 17, color: color.ink, marginBottom: 12 },
  hist: { flexDirection: "row", gap: 12 },
  rail: { width: 14, alignItems: "center" },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: color.line, marginTop: 4 },
  line: { flex: 1, width: 2, backgroundColor: color.line, marginTop: 2 },
});
