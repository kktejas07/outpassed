import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useHostels } from "../../src/features/admin/useAdmin";
import { color, font, radius } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Empty, ErrorNote, Loading } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn } from "../../src/ui/motion";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

/** Admins list hostels and choose which wardens look after each one. */
export default function Hostels() {
  const vm = useHostels();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  return (
    <Screen title="Hostels" eyebrow="Campus" back refreshing={vm.refreshing} onRefresh={vm.refresh}>
      <FadeIn>
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={color.indigo} />
          <Text variant="caption" style={{ flex: 1, color: color.ink }}>
            A warden sees requests, alerts and notices only for the hostels ticked here. A warden with none ticked covers every hostel.
          </Text>
        </View>
      </FadeIn>
      <FadeIn index={1}>
        <Card style={{ gap: 10 }}>
          <Field label="Add a hostel" value={name} onChangeText={setName} placeholder="e.g. Girls Hostel" onSubmitEditing={async () => name.trim() && (await vm.create(name)) && setName("")} />
          <Button compact icon="add" label="Add hostel" disabled={!name.trim()} loading={vm.busy && !editing} onPress={async () => (await vm.create(name)) && setName("")} />
        </Card>
      </FadeIn>
      {vm.actionError ? <ErrorNote message={vm.actionError} /> : null}
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}
      {!vm.loading && vm.hostels.length === 0 ? <Empty icon="business-outline" title="No hostels yet" body="Add one above, or import students with a hostel column." /> : null}
      {vm.hostels.map((h, i) => (
        <FadeIn key={h.id} index={i + 2}>
          <Card style={{ gap: 12 }}>
            {editing?.id === h.id ? (
              <View style={{ gap: 10 }}>
                <Field label="Hostel name" value={editing.name} onChangeText={(v) => setEditing({ id: h.id, name: v })} autoFocus />
                <View style={styles.row}>
                  <Button compact tone="outline" label="Cancel" style={{ flex: 1 }} onPress={() => setEditing(null)} />
                  <Button compact label="Save" style={{ flex: 1 }} loading={vm.busy} disabled={!editing.name.trim()} onPress={async () => (await vm.rename(h.id, editing.name)) && setEditing(null)} />
                </View>
              </View>
            ) : (
              <View style={styles.row}>
                <View style={styles.icon}><Ionicons name="business" size={20} color={color.white} /></View>
                <View style={{ flex: 1 }}>
                  <Text variant="heading">{h.name}</Text>
                  <Text variant="caption">{h.students} student{h.students === 1 ? "" : "s"} · {h.wardens.length ? h.wardens.map((w) => w.name).join(", ") : "no warden assigned"}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Rename ${h.name}`} hitSlop={8} onPress={() => setEditing({ id: h.id, name: h.name })}>
                  <Ionicons name="create-outline" size={20} color={color.muted} />
                </Pressable>
              </View>
            )}
            {vm.wardens.length ? (
              <View style={styles.chips}>
                {vm.wardens.map((w) => {
                  const on = h.wardens.some((x) => x.id === w.id);
                  return (
                    <Pressable
                      key={w.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() => void vm.toggleWarden(h.id, w.id, !on)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={16} color={on ? color.white : color.muted} />
                      <Text style={[styles.chipText, on && { color: color.white }]}>{w.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text variant="caption">Add warden accounts in People to assign them here.</Text>
            )}
          </Card>
        </FadeIn>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, backgroundColor: color.indigoTint },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.indigo, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, backgroundColor: color.white },
  chipOn: { backgroundColor: color.indigo, borderColor: color.indigo },
  chipText: { fontFamily: font.bodyBold, fontSize: 13, color: color.ink },
});
