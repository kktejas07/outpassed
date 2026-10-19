import Ionicons from "@expo/vector-icons/Ionicons";
import type { OutpassDto } from "@outpassed/shared";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { when } from "../lib/format";
import { color, radius } from "../theme/tokens";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Chips, ErrorNote } from "../ui/bits";
import { Field } from "../ui/Field";
import { PopIn } from "../ui/motion";
import { Text } from "../ui/Text";

const EXTRA = [
  { value: "30", label: "+30 min", mins: 30 },
  { value: "60", label: "+1 hour", mins: 60 },
  { value: "120", label: "+2 hours", mins: 120 },
  { value: "240", label: "+4 hours", mins: 240 },
  { value: "1440", label: "+1 day", mins: 1440 },
] as const;
const REASONS = ["Traffic", "Bus or train delayed", "Family function", "Medical", "Exam or interview ran late"];

/** Student: ask to come back later. Shows the request's state once sent. */
export function LateReturnAsk({
  outpass,
  canAsk,
  busy,
  error,
  onSend,
}: {
  outpass: OutpassDto;
  canAsk: boolean;
  busy: boolean;
  error: string | null;
  onSend: (until: Date, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState<(typeof EXTRA)[number]["value"]>("60");
  const [reason, setReason] = useState("");
  const until = useMemo(() => {
    const mins = EXTRA.find((e) => e.value === extra)!.mins;
    return new Date(new Date(outpass.returnBy).getTime() + mins * 60_000);
  }, [extra, outpass.returnBy]);

  return (
    <View style={{ gap: 10 }}>
      <ExtensionNote outpass={outpass} />
      {canAsk && !open ? (
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.ask}>
          <Ionicons name="time-outline" size={20} color={color.indigo} />
          <View style={{ flex: 1 }}>
            <Text variant="label">Running late?</Text>
            <Text variant="caption">Ask the warden for more time before {when(outpass.returnBy)}.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={color.muted} />
        </Pressable>
      ) : null}
      {canAsk && open ? (
        <PopIn>
          <Card style={{ gap: 12 }}>
            <Text variant="heading">Ask for more time</Text>
            <Chips options={EXTRA.map((e) => ({ value: e.value, label: e.label }))} value={extra} onChange={setExtra} />
            <Text variant="caption">New return time: <Text variant="label">{when(until)}</Text></Text>
            <Field label="Why?" value={reason} onChangeText={setReason} placeholder="e.g. Bus from Vijayawada is 2 hours late" />
            <View style={styles.reasons}>
              {REASONS.map((r) => (
                <Pressable key={r} onPress={() => setReason(r)} style={styles.reason} accessibilityRole="button">
                  <Text variant="caption" style={{ color: color.ink }}>{r}</Text>
                </Pressable>
              ))}
            </View>
            {error ? <ErrorNote message={error} /> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button style={{ flex: 1 }} tone="outline" label="Not now" onPress={() => setOpen(false)} />
              <Button style={{ flex: 1.4 }} label="Send request" icon="paper-plane-outline" loading={busy} disabled={reason.trim().length < 3} onPress={() => onSend(until, reason.trim())} />
            </View>
          </Card>
        </PopIn>
      ) : null}
    </View>
  );
}

/** The state of the latest request for more time. */
export function ExtensionNote({ outpass }: { outpass: OutpassDto }) {
  const e = outpass.extension;
  if (!e) return null;
  const look =
    e.status === "PENDING"
      ? { icon: "hourglass-outline" as const, fg: color.amber, bg: color.amberSoft, text: `Asked to return by ${when(e.requestedReturnBy)}. Waiting for the warden.` }
      : e.status === "APPROVED"
        ? { icon: "checkmark-circle-outline" as const, fg: color.green, bg: color.greenSoft, text: `Return time moved to ${when(e.requestedReturnBy)} by ${e.decidedByName ?? "the warden"}.` }
        : { icon: "close-circle-outline" as const, fg: color.red, bg: color.redSoft, text: `Request for more time declined. Return by ${when(e.previousReturnBy)}.` };
  return (
    <View style={[styles.note, { backgroundColor: look.bg }]}>
      <Ionicons name={look.icon} size={18} color={look.fg} />
      <Text variant="label" style={{ color: look.fg, flex: 1 }}>{look.text}</Text>
    </View>
  );
}

/** Warden: approve or decline a request for more time. */
export function LateReturnDecision({
  outpass,
  busy,
  error,
  onDecide,
}: {
  outpass: OutpassDto;
  busy: boolean;
  error: string | null;
  onDecide: (d: "APPROVE" | "REJECT") => void;
}) {
  const e = outpass.extension!;
  const extraMins = Math.round((new Date(e.requestedReturnBy).getTime() - new Date(e.previousReturnBy).getTime()) / 60000);
  const extra = extraMins >= 1440 ? `${Math.round(extraMins / 1440)} day(s)` : extraMins >= 60 ? `${Math.round((extraMins / 60) * 10) / 10} h` : `${extraMins} min`;
  return (
    <PopIn>
      <Card accent="#F59E0B" style={{ gap: 10 }}>
        <Text variant="eyebrow">Asking for more time · +{extra}</Text>
        <Text variant="heading">Return by {when(e.requestedReturnBy)}</Text>
        <Text variant="caption">Was {when(e.previousReturnBy)}</Text>
        <Text variant="body">“{e.reason}”</Text>
        {error ? <ErrorNote message={error} /> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button style={{ flex: 1 }} tone="danger" icon="close" label="Decline" loading={busy} onPress={() => onDecide("REJECT")} />
          <Button style={{ flex: 1.4 }} icon="checkmark" label="Give more time" loading={busy} onPress={() => onDecide("APPROVE")} />
        </View>
      </Card>
    </PopIn>
  );
}

const styles = StyleSheet.create({
  ask: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: color.indigoTint },
  note: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 14 },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reason: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: color.line, backgroundColor: color.white },
});
