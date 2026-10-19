import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { campus, errorMessage } from "../../src/api/client";
import { useSession } from "../../src/auth/session";
import { useQuery } from "../../src/lib/useQuery";
import { color, font, radius, shadow } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Empty, ErrorNote, Loading } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn } from "../../src/ui/motion";
import { useRibbon } from "../../src/ui/Ribbon";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

/** Departments and their HODs. The HOD hears about every pass from their department's students. */
export default function Departments() {
  const { token } = useSession();
  const ribbon = useRibbon();
  const q = useQuery(async (t) => ({ departments: await campus.departments(t), faculty: await campus.faculty(t) }));
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await q.reload();
      ribbon.show({ tone: "success", title: done });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Departments" eyebrow="Academics" back refreshing={q.refreshing} onRefresh={q.refresh}>
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={18} color={color.indigo} />
        <Text variant="caption" style={{ flex: 1, color: color.ink }}>
          Students pick the faculty member who gave them permission; that person approves first. The department's HOD is told about every pass, exit and return.
        </Text>
      </View>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 2 }}><Field label="Department" value={name} onChangeText={setName} placeholder="e.g. Computer Science" /></View>
          <View style={{ flex: 1 }}><Field label="Code" value={code} onChangeText={setCode} placeholder="CSE" autoCapitalize="characters" /></View>
        </View>
        <Button compact icon="add" label="Add department" disabled={!name.trim()} loading={busy} onPress={() => token && void run(async () => { await campus.createDepartment(token, name.trim(), code.trim() || undefined); setName(""); setCode(""); }, "Department added")} />
      </Card>
      {error ? <ErrorNote message={error} /> : null}
      {q.loading ? <Loading rows={2} /> : null}
      {q.data && q.data.departments.length === 0 ? <Empty icon="school-outline" title="No departments yet" body="Add them above, or import students with a department column." /> : null}
      {q.data?.departments.map((d, i) => {
        const pool = q.data!.faculty.filter((f) => f.department === d.name || !f.department);
        return (
          <FadeIn key={d.id} index={i}>
            <View style={[styles.card, shadow.card]}>
              <Pressable onPress={() => setOpen(open === d.id ? null : d.id)} accessibilityRole="button" style={styles.head}>
                <View style={styles.badge}><Text style={styles.code}>{d.code ?? d.name.slice(0, 3).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text variant="heading">{d.name}</Text>
                  <Text variant="caption">{d.students} students · {d.faculty} faculty · HOD: {d.hod?.name ?? "not set"}</Text>
                </View>
                <Ionicons name={open === d.id ? "chevron-up" : "chevron-down"} size={18} color={color.muted} />
              </Pressable>
              {open === d.id ? (
                <View style={{ gap: 8 }}>
                  <Text variant="eyebrow">Choose the HOD</Text>
                  {pool.length === 0 ? <Text variant="caption">Add faculty accounts in People first.</Text> : null}
                  {pool.map((f) => {
                    const on = d.hod?.id === f.id;
                    return (
                      <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => token && void run(() => campus.setHod(token, d.id, on ? null : f.id), on ? "HOD removed" : `${f.name} is now HOD`)} style={[styles.fac, on && styles.facOn]}>
                        <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={18} color={on ? color.white : color.muted} />
                        <Text variant="label" style={on ? { color: color.white } : undefined}>{f.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </FadeIn>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, backgroundColor: color.indigoTint },
  card: { backgroundColor: color.white, borderRadius: radius.lg, padding: 14, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { width: 46, height: 46, borderRadius: 14, backgroundColor: color.indigo, alignItems: "center", justifyContent: "center" },
  code: { fontFamily: font.bodyBold, fontSize: 12, color: color.white },
  fac: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: color.ground },
  facOn: { backgroundColor: color.indigo },
});
