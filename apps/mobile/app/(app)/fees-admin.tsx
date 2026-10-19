import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Image, StyleSheet, Switch, View } from "react-native";
import { api, campus, errorMessage, photoSrc, rupees, type FeeDto } from "../../src/api/client";
import { useSession } from "../../src/auth/session";
import { useQuery } from "../../src/lib/useQuery";
import { color, font, radius, shadow } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Chips, Empty, ErrorNote, Loading, SectionTitle, Segmented } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { CountUp, FadeIn, PopIn } from "../../src/ui/motion";
import { Pill } from "../../src/ui/Pill";
import { useRibbon } from "../../src/ui/Ribbon";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

const categories = [
  { value: "HOSTEL", label: "Hostel" },
  { value: "MESS", label: "Mess" },
  { value: "BUS", label: "Bus" },
  { value: "TUITION", label: "Tuition" },
  { value: "EXAM", label: "Exam" },
  { value: "FINE", label: "Fine" },
  { value: "OTHER", label: "Other" },
] as const;
const dueIn = [
  { value: "7", label: "In 1 week" },
  { value: "15", label: "In 15 days" },
  { value: "30", label: "In 30 days" },
];
const filters = [
  { value: "SUBMITTED", label: "Proofs to check" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "DUE", label: "Due" },
  { value: "PAID", label: "Paid" },
];

function AssignFee({ onDone }: { onDone: () => void }) {
  const { token } = useSession();
  const ribbon = useRibbon();
  const targets = useQuery(async (t) => ({ hostels: await api.adminHostels(t), departments: await campus.departments(t) }));
  const [category, setCategory] = useState<FeeDto["category"]>("HOSTEL");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("15");
  const [target, setTarget] = useState("all");
  const [allowParts, setAllowParts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opts = [
    { value: "all", label: "All students" },
    ...(targets.data?.hostels ?? []).map((h) => ({ value: `h:${h.id}`, label: h.name })),
    ...(targets.data?.departments ?? []).map((d) => ({ value: `d:${d.id}`, label: d.code ?? d.name })),
  ];
  const valid = title.trim().length >= 2 && Number(amount) >= 1;

  async function submit() {
    if (!token || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const date = new Date(Date.now() + Number(due) * 86_400_000).toISOString().slice(0, 10);
      const t = target === "all" ? { allStudents: true } : target.startsWith("h:") ? { hostelId: target.slice(2) } : { departmentId: target.slice(2) };
      const res = await campus.assignFee(token, { category, title: title.trim(), amountPaise: Math.round(Number(amount) * 100), dueDate: date, allowParts, target: t });
      ribbon.show({ tone: "success", title: `Fee sent to ${res.created} student${res.created === 1 ? "" : "s"}`, body: "They'll get reminders before it's due.", celebrate: true });
      setTitle("");
      setAmount("");
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Couldn't assign the fee"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PopIn style={[styles.form, shadow.card]}>
      <Text variant="heading">Assign a fee</Text>
      <Chips options={categories.map((c) => ({ ...c }))} value={category} onChange={(v) => setCategory(v as FeeDto["category"])} />
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Hostel fee · Semester 2" />
      <Field label="Amount (₹)" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, "").slice(0, 9))} keyboardType="decimal-pad" placeholder="45000" />
      <Text variant="eyebrow">Due</Text>
      <Chips options={dueIn} value={due} onChange={setDue} />
      <Text variant="eyebrow">For</Text>
      <Chips options={opts} value={target} onChange={setTarget} />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="label">Allow paying in parts</Text>
          <Text variant="caption">Students can pay some now and the rest later; each part gets its own receipt.</Text>
        </View>
        <Switch accessibilityLabel="Allow paying in parts" value={allowParts} onValueChange={setAllowParts} trackColor={{ true: color.indigo, false: color.line }} />
      </View>
      {error ? <ErrorNote message={error} /> : null}
      <Button icon="send" label="Send to students" loading={busy} disabled={!valid} onPress={submit} />
    </PopIn>
  );
}

function ProofCard({ f, onChanged }: { f: FeeDto; onChanged: () => void }) {
  const { token } = useSession();
  const ribbon = useRibbon();
  const p = f.payments.find((x) => x.method === "PROOF" && x.status === "PENDING");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!p) return null;
  const src = photoSrc(p.proofUrl);
  async function decide(decision: "APPROVE" | "REJECT") {
    if (!token || !p) return;
    setBusy(true);
    setError(null);
    try {
      await campus.reviewProof(token, p.id, decision, note.trim() || undefined);
      ribbon.show(decision === "APPROVE" ? { tone: "success", title: `${f.student.name}: marked paid` } : { tone: "info", title: "Sent back to the student" });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={[styles.card, shadow.card]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="label">{f.student.name}</Text>
          <Text variant="caption">{[f.student.rollNo, f.title, p.amountPaise < f.remainingPaise ? `part of ${rupees(f.remainingPaise)} left` : null].filter(Boolean).join(" · ")}</Text>
        </View>
        <Text style={styles.amount}>{rupees(p.amountPaise)}</Text>
      </View>
      {src ? <Image source={{ uri: src }} style={styles.proof} resizeMode="contain" accessibilityLabel="Payment screenshot" /> : null}
      <Text variant="caption">Reference: <Text variant="label">{p.reference}</Text></Text>
      <Field label="Note to student (needed to reject)" value={note} onChangeText={setNote} placeholder="e.g. Amount doesn't match" />
      {error ? <ErrorNote message={error} /> : null}
      <View style={styles.row}>
        <Button compact tone="danger" label="Reject" style={{ flex: 1 }} disabled={busy || note.trim().length < 3} onPress={() => void decide("REJECT")} />
        <Button compact tone="success" icon="checkmark" label="Matches: paid" style={{ flex: 1.4 }} loading={busy} onPress={() => void decide("APPROVE")} />
      </View>
    </View>
  );
}

/** The office: assign fees, check payment proofs, mark counter payments. */
export default function FeesAdmin() {
  const { token } = useSession();
  const ribbon = useRibbon();
  const [filter, setFilter] = useState("SUBMITTED");
  const [mode, setMode] = useState<"list" | "assign">("list");
  const q = useQuery((t) => campus.adminFees(t, filter), [filter]);
  const s = q.data?.summary;

  return (
    <Screen title="Fees" eyebrow="Office" back refreshing={q.refreshing} onRefresh={q.refresh}>
      {s ? (
        <FadeIn>
          <View style={styles.tiles}>
            <View style={[styles.tile, shadow.card]}>
              <CountUp value={s.outstandingPaise / 100} format={(n) => `₹${Math.round(n).toLocaleString("en-IN")}`} style={[styles.tileN, { color: color.amber }]} />
              <Text variant="caption">outstanding · {s.outstanding} fee{s.outstanding === 1 ? "" : "s"}</Text>
            </View>
            <View style={[styles.tile, shadow.card]}>
              <CountUp value={s.collectedPaise / 100} format={(n) => `₹${Math.round(n).toLocaleString("en-IN")}`} style={[styles.tileN, { color: color.green }]} />
              <Text variant="caption">collected · {s.paid} fee{s.paid === 1 ? "" : "s"}</Text>
            </View>
          </View>
        </FadeIn>
      ) : null}
      <Segmented options={[{ value: "list", label: "Payments" }, { value: "assign", label: "Assign a fee" }]} value={mode} onChange={setMode} />
      {mode === "assign" ? (
        <AssignFee onDone={() => { setMode("list"); void q.reload(); }} />
      ) : (
        <>
          <Chips options={filters.map((f) => ({ ...f, label: f.value === "SUBMITTED" && s?.proofsToReview ? `${f.label} · ${s.proofsToReview}` : f.label }))} value={filter} onChange={setFilter} />
          {q.error ? <ErrorNote message={q.error} onRetry={q.refresh} /> : null}
          {q.loading ? <Loading rows={2} /> : null}
          {!q.loading && q.data?.fees.length === 0 ? <Empty icon="checkmark-done-circle-outline" title={filter === "SUBMITTED" ? "No proofs waiting" : "Nothing here"} /> : null}
          {filter === "SUBMITTED"
            ? q.data?.fees.map((f, i) => (
                <FadeIn key={f.id} index={i}>
                  <ProofCard f={f} onChanged={() => void q.reload()} />
                </FadeIn>
              ))
            : (
              <>
                {q.data?.fees.length ? <SectionTitle title={`${q.data.fees.length} fee${q.data.fees.length === 1 ? "" : "s"}`} /> : null}
                {q.data?.fees.map((f, i) => (
                  <FadeIn key={f.id} index={i}>
                    <View style={[styles.card, shadow.card]}>
                      <View style={styles.row}>
                        <Ionicons name={f.status === "PAID" ? "checkmark-circle" : f.overdue ? "alert-circle" : "time-outline"} size={22} color={f.status === "PAID" ? color.green : f.overdue ? color.red : color.amber} />
                        <View style={{ flex: 1 }}>
                          <Text variant="label">{f.student.name}</Text>
                          <Text variant="caption" numberOfLines={1}>{[f.student.rollNo, f.title, `due ${f.dueDate}`].filter(Boolean).join(" · ")}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 4 }}>
                          <Text style={styles.amount}>{rupees(f.status === "PAID" ? f.amountPaise : f.remainingPaise)}</Text>
                          {f.overdue ? <Pill label="Overdue" tone="red" /> : f.paidPaise > 0 && f.status !== "PAID" ? <Pill label="Part paid" tone="amber" /> : null}
                        </View>
                      </View>
                      {f.status === "DUE" ? (
                        <Button
                          compact
                          tone="outline"
                          icon="cash-outline"
                          label="Paid at the counter"
                          onPress={async () => {
                            if (!token) return;
                            await campus.markPaid(token, f.id).catch(() => undefined);
                            ribbon.show({ tone: "success", title: `${f.student.name}: marked paid` });
                            void q.reload();
                          }}
                        />
                      ) : null}
                    </View>
                  </FadeIn>
                ))}
              </>
            )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, backgroundColor: color.white, borderRadius: radius.lg, padding: 14, gap: 2 },
  tileN: { fontFamily: font.display, fontSize: 22 },
  form: { backgroundColor: color.white, borderRadius: radius.lg, padding: 16, gap: 12 },
  card: { backgroundColor: color.white, borderRadius: radius.lg, padding: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  amount: { fontFamily: font.display, fontSize: 16, color: color.ink },
  proof: { width: "100%", height: 260, borderRadius: radius.md, backgroundColor: color.ground },
});
