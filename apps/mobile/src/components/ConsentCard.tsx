import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { campus, errorMessage, type ConsentRow } from "../api/client";
import { useSession } from "../auth/session";
import { useQuery } from "../lib/useQuery";
import { color, radius, shadow } from "../theme/tokens";
import { Button } from "../ui/Button";
import { ErrorNote } from "../ui/bits";
import { PopIn } from "../ui/motion";
import { useRibbon } from "../ui/Ribbon";
import { Text } from "../ui/Text";

const first = (name: string) => name.split(" ")[0] ?? name;

function Point({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: string }) {
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={16} color={color.indigo} style={{ marginTop: 1 }} />
      <Text variant="caption" style={{ flex: 1, color: color.ink }}>{children}</Text>
    </View>
  );
}

function Ask({ c, days, onDone }: { c: ConsentRow; days: number; onDone: () => void }) {
  const { token } = useSession();
  const ribbon = useRibbon();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = first(c.student.name);

  async function agree() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await campus.giveConsent(token, c.student.id);
      ribbon.show({ tone: "success", title: `Photos allowed for ${name}`, body: "You can withdraw this any time on the Me tab." });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PopIn style={[styles.card, shadow.card]}>
      <View style={styles.head}>
        <View style={styles.icon}><Ionicons name="shield-checkmark" size={20} color={color.white} /></View>
        <View style={{ flex: 1 }}>
          <Text variant="eyebrow">Your permission is needed</Text>
          <Text variant="heading">Allow photos of {name}?</Text>
        </View>
      </View>
      <Text variant="caption">{name} is under 18, so the college asks you before keeping any photos of {name}.</Text>
      <View style={{ gap: 8 }}>
        <Point icon="person-circle-outline">{`A profile photo, so the guard can check it's really ${name} at the gate.`}</Point>
        <Point icon="camera-outline">A photo each time they go out or come back in.</Point>
        <Point icon="time-outline">{`Gate photos are deleted after ${days} days. Only guards, wardens and the college office can see them.`}</Point>
        <Point icon="refresh-outline">You can withdraw this any time; the photos are then deleted.</Point>
      </View>
      <Text variant="caption">If you don't agree, {name} can still use outpasses; the guard checks their college ID instead.</Text>
      {error ? <ErrorNote message={error} /> : null}
      <Button icon="checkmark" label="I agree" loading={busy} onPress={agree} />
    </PopIn>
  );
}

/** Parents: asks for photo consent for each child who needs it. Renders nothing otherwise. */
export function ConsentCard() {
  const q = useQuery((t) => campus.consent(t));
  const needed = q.data?.children.filter((c) => c.state === "NEEDED") ?? [];
  if (!needed.length) return null;
  return (
    <>
      {needed.map((c) => <Ask key={c.student.id} c={c} days={q.data?.retentionDays ?? 90} onDone={() => void q.reload()} />)}
    </>
  );
}

/** Parents, on the Me tab: who photos are allowed for, with a way to withdraw. */
export function ConsentSettings() {
  const { token } = useSession();
  const ribbon = useRibbon();
  const q = useQuery((t) => campus.consent(t));
  const [confirm, setConfirm] = useState<string | null>(null);
  const rows = q.data?.children.filter((c) => c.state !== "NOT_NEEDED") ?? [];
  if (!rows.length) return null;
  return (
    <View style={[styles.card, shadow.card]}>
      <Text variant="heading">Photo permission</Text>
      {rows.map((c) => (
        <View key={c.student.id} style={{ gap: 8 }}>
          <View style={styles.rowLine}>
            <View style={{ flex: 1 }}>
              <Text variant="label">{c.student.name}</Text>
              <Text variant="caption">
                {c.state === "GIVEN"
                  ? `Allowed${c.givenBy ? ` by ${c.givenBy}` : ""}${c.givenAt ? ` on ${new Date(c.givenAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}`
                  : "Not allowed: no photos are kept"}
              </Text>
            </View>
            {c.state === "GIVEN" && confirm !== c.student.id ? <Button compact tone="outline" label="Withdraw" onPress={() => setConfirm(c.student.id)} /> : null}
            {c.state === "NEEDED" ? (
              <Button
                compact
                label="Allow"
                onPress={async () => {
                  if (!token) return;
                  await campus.giveConsent(token, c.student.id).catch(() => undefined);
                  ribbon.show({ tone: "success", title: `Photos allowed for ${first(c.student.name)}` });
                  void q.reload();
                }}
              />
            ) : null}
          </View>
          {confirm === c.student.id ? (
            <View style={styles.confirm}>
              <Text variant="caption" style={{ color: color.ink }}>This deletes {first(c.student.name)}'s profile photo and every gate photo now. The guard will check their college ID instead.</Text>
              <View style={styles.rowLine}>
                <Button compact tone="outline" label="Keep" style={{ flex: 1 }} onPress={() => setConfirm(null)} />
                <Button
                  compact
                  tone="danger"
                  label="Withdraw"
                  style={{ flex: 1.4 }}
                  onPress={async () => {
                    if (!token) return;
                    const res = await campus.withdrawConsent(token, c.student.id).catch(() => null);
                    setConfirm(null);
                    const n = res ? res.removed.profile + res.removed.gate : 0;
                    if (res) ribbon.show({ tone: "info", title: "Permission withdrawn", body: n ? `${n} photo${n === 1 ? "" : "s"} deleted.` : "No photos had been kept." });
                    void q.reload();
                  }}
                />
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.white, borderRadius: radius.lg, padding: 16, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.indigo, alignItems: "center", justifyContent: "center" },
  point: { flexDirection: "row", gap: 8 },
  rowLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  confirm: { gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: color.redSoft },
});
