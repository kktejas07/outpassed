import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { rupees, type FeeDto } from "../api/client";
import { useSession } from "../auth/session";
import { useFees } from "../features/campus/useCampus";
import { pickDocument } from "../features/photo/pickPhoto";
import { color, font, radius, shadow } from "../theme/tokens";
import { Button } from "../ui/Button";
import { Empty, ErrorNote, Loading, SectionTitle } from "../ui/bits";
import { Field } from "../ui/Field";
import { CountUp, FadeIn, PopIn } from "../ui/motion";
import { Pill, type PillTone } from "../ui/Pill";
import { Screen } from "../ui/Screen";
import { Text } from "../ui/Text";

const ICON: Record<FeeDto["category"], keyof typeof Ionicons.glyphMap> = {
  HOSTEL: "bed",
  MESS: "restaurant",
  BUS: "bus",
  TUITION: "school",
  EXAM: "document-text",
  FINE: "alert-circle",
  OTHER: "wallet",
};

function status(f: FeeDto): { label: string; tone: PillTone } {
  if (f.status === "PAID") return { label: "Paid", tone: "green" };
  if (f.status === "SUBMITTED") return { label: "Proof with office", tone: "amber" };
  if (f.status === "WAIVED") return { label: "Waived", tone: "neutral" };
  return f.overdue ? { label: "Overdue", tone: "red" } : { label: "Due", tone: "indigo" };
}

const due = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function FeeCard({ f, vm, showStudent, index }: { f: FeeDto; vm: ReturnType<typeof useFees>; showStudent: boolean; index: number }) {
  const [proofOpen, setProofOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const s = status(f);
  const rejected = f.payments.find((p) => p.status === "REJECTED" && p.method === "PROOF");
  const open = f.status === "DUE";

  async function payOnline() {
    const link = await vm.payLink(f.id);
    if (!link) return;
    setPaying(true);
    if (Platform.OS === "web") globalThis.open?.(link.url, "_blank");
    else await Linking.openURL(link.url);
  }

  return (
    <FadeIn index={index}>
      <View style={[styles.card, shadow.card, f.overdue && { borderColor: "#F3C7C7", borderWidth: 1.5 }]}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: f.overdue ? color.red : color.indigo }]}>
            <Ionicons name={ICON[f.category]} size={18} color={color.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" numberOfLines={2}>{f.title}</Text>
            <Text variant="caption">{showStudent ? `${f.student.name} · ` : ""}{f.status === "PAID" && f.paidAt ? `Paid ${new Date(f.paidAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : `Due ${due(f.dueDate)}`}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Text style={styles.amount}>{rupees(f.amountPaise)}</Text>
            <Pill label={s.label} tone={s.tone} />
          </View>
        </View>
        {f.note ? <Text variant="caption">{f.note}</Text> : null}
        {open && rejected ? (
          <View style={styles.rejected}>
            <Ionicons name="close-circle" size={16} color={color.red} />
            <Text variant="caption" style={{ flex: 1, color: color.red }}>Your proof wasn't accepted: {rejected.note}</Text>
          </View>
        ) : null}
        {open ? (
          <View style={{ gap: 10 }}>
            <View style={styles.actions}>
              {vm.online ? <Button compact icon="card-outline" label="Pay online" loading={vm.busy && !proofOpen} style={{ flex: 1 }} onPress={() => void payOnline()} /> : null}
              <Button compact tone="outline" icon="image-outline" label="Upload proof" style={{ flex: 1 }} onPress={() => setProofOpen((o) => !o)} />
            </View>
            {paying ? <Button compact tone="ghost" icon="refresh" label="I've paid: check now" onPress={() => void vm.check(f.id)} /> : null}
            {proofOpen ? (
              <PopIn style={styles.proof}>
                <Text variant="caption" style={{ color: color.ink }}>Paid by UPI or at the bank? Add the screenshot and the reference number (UTR) so the office can match it.</Text>
                <Button
                  compact
                  tone="outline"
                  icon={image ? "checkmark-circle" : "image-outline"}
                  label={image ? "Screenshot added" : "Choose screenshot"}
                  onPress={async () => {
                    const img = await pickDocument().catch(() => null);
                    if (img) setImage(img);
                  }}
                />
                <Field label="Reference / UTR number" value={reference} onChangeText={setReference} placeholder="e.g. 402177889911" autoCapitalize="characters" />
                <Button
                  compact
                  tone="success"
                  icon="send"
                  label="Send to office"
                  loading={vm.busy}
                  disabled={!image || reference.trim().length < 4}
                  onPress={async () => {
                    if (image && (await vm.sendProof(f.id, image, reference.trim()))) setProofOpen(false);
                  }}
                />
              </PopIn>
            ) : null}
          </View>
        ) : null}
      </View>
    </FadeIn>
  );
}

/** Students and parents: what's due, pay online or send proof. */
export function FeesScreen({ back = true }: { back?: boolean }) {
  const { user } = useSession();
  const vm = useFees();
  const { checked } = useLocalSearchParams<{ checked?: string }>();
  // Coming back from the payment page: confirm it landed.
  useEffect(() => {
    if (checked) void vm.check(checked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);
  const open = vm.fees.filter((f) => f.status === "DUE" || f.status === "SUBMITTED");
  const settled = vm.fees.filter((f) => f.status === "PAID");
  const parent = user?.role === "PARENT";
  return (
    <Screen title="Fees" eyebrow={parent ? "Your child's dues" : "Your dues"} back={back} refreshing={vm.refreshing} onRefresh={vm.refresh}>
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading rows={2} /> : null}
      {vm.totals ? (
        <FadeIn>
          <View style={[styles.summary, shadow.primary]}>
            <Text style={styles.sumLabel}>{open.length ? "Total due" : "All paid up"}</Text>
            <CountUp value={vm.totals.duePaise / 100} format={(n) => `₹${Math.round(n).toLocaleString("en-IN")}`} style={styles.sumAmount} />
            <Text style={styles.sumSub}>
              {vm.totals.overdue ? `${vm.totals.overdue} overdue · ` : ""}
              {vm.online ? "Pay online, or send a payment screenshot" : "Pay at the office, or send a payment screenshot"}
            </Text>
          </View>
        </FadeIn>
      ) : null}
      {vm.actionError ? <ErrorNote message={vm.actionError} /> : null}
      {!vm.loading && vm.fees.length === 0 ? <Empty icon="wallet-outline" title="No fees yet" body="Hostel, mess, bus and tuition fees from the college will show here with reminders before they're due." /> : null}
      {open.map((f, i) => <FeeCard key={f.id} f={f} vm={vm} showStudent={parent} index={i} />)}
      {settled.length ? <SectionTitle title={`Paid · ${settled.length}`} /> : null}
      {settled.map((f, i) => <FeeCard key={f.id} f={f} vm={vm} showStudent={parent} index={i + open.length} />)}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: color.indigo, borderRadius: radius.lg, padding: 18, gap: 2 },
  sumLabel: { fontFamily: font.bodyBold, fontSize: 13, color: color.headSub },
  sumAmount: { fontFamily: font.display, fontSize: 34, color: color.white },
  sumSub: { fontFamily: font.body, fontSize: 13, color: "#E0E7FF" },
  card: { backgroundColor: color.white, borderRadius: radius.lg, padding: 16, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  amount: { fontFamily: font.display, fontSize: 17, color: color.ink },
  actions: { flexDirection: "row", gap: 10 },
  proof: { gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: color.ground },
  rejected: { flexDirection: "row", gap: 8, padding: 10, borderRadius: radius.sm, backgroundColor: color.redSoft },
});
