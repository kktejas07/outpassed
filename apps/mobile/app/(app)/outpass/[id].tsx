import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ApprovalTimeline } from "../../../src/components/ApprovalTimeline";
import { GatePass } from "../../../src/components/GatePass";
import { useOutpassDetail } from "../../../src/features/outpass/useOutpassDetail";
import { outpassStatus, relative, studentLine, typeLabel, when } from "../../../src/lib/format";
import { color } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Avatar, ErrorNote, KeyValue, Loading } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn, PopIn } from "../../../src/ui/motion";
import { Pill } from "../../../src/ui/Pill";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

export default function OutpassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useOutpassDetail(id);
  const [reason, setReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const p = vm.pass;

  if (!p) {
    return (
      <Screen title="Outpass" back>
        {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : <Loading />}
      </Screen>
    );
  }

  const status = outpassStatus(p);
  const isStudent = vm.role === "STUDENT";
  const reasonMissing = vm.needsOverrideReason && reason.trim().length < 3;

  const footer = vm.canDecide ? (
    <>
      {vm.decideError ? <ErrorNote message={vm.decideError} /> : null}
      <View style={styles.actions}>
        <Button style={{ flex: 1 }} tone="danger" icon="close" label="Reject" loading={vm.deciding} onPress={() => vm.decide("REJECT", reason.trim() || undefined)} disabled={vm.needsOverrideReason && reasonMissing} />
        <Button style={{ flex: 1.4 }} icon="checkmark" label={vm.needsOverrideReason ? "Override" : "Approve"} loading={vm.deciding} onPress={() => vm.decide("APPROVE", reason.trim() || undefined)} disabled={reasonMissing} />
      </View>
    </>
  ) : vm.canCancel ? (
    <>
      {vm.cancelError ? <ErrorNote message={vm.cancelError} /> : null}
      {confirmCancel ? (
        <View style={styles.actions}>
          <Button style={{ flex: 1 }} tone="outline" label="Keep it" onPress={() => setConfirmCancel(false)} />
          <Button style={{ flex: 1 }} tone="danger" label="Yes, cancel" loading={vm.cancelling} onPress={vm.cancel} />
        </View>
      ) : (
        <Button tone="outline" label="Cancel request" onPress={() => setConfirmCancel(true)} />
      )}
    </>
  ) : undefined;

  return (
    <Screen
      title={isStudent ? p.destination : p.student.name}
      eyebrow={`${typeLabel(p.type)} outpass`}
      back
      right={<Pill label={status.label} tone={status.tone} />}
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      footer={footer}
    >
      {vm.showQr ? (
        <PopIn>
          <GatePass outpass={p} token={vm.qr?.token ?? null} lifetime={vm.qr?.lifetime ?? 30} error={vm.qrError} />
        </PopIn>
      ) : null}

      {p.overdue ? (
        <FadeIn>
          <View style={styles.overdue}>
            <Ionicons name="warning" size={18} color={color.red} />
            <Text variant="label" style={{ color: color.red, flex: 1 }}>
              Overdue — was due back {relative(p.returnBy)}
            </Text>
          </View>
        </FadeIn>
      ) : null}

      {!isStudent ? (
        <FadeIn index={1}>
          <Card style={styles.who}>
            <Avatar name={p.student.name} size={46} />
            <View style={{ flex: 1 }}>
              <Text variant="heading">{p.student.name}</Text>
              <Text variant="caption">{studentLine(p.student) || "Student"}</Text>
            </View>
          </Card>
        </FadeIn>
      ) : null}

      <FadeIn index={2}>
        <Card style={{ paddingVertical: 6 }}>
          <KeyValue label="Destination" value={p.destination} />
          <KeyValue label="Leave from" value={when(p.leaveAt)} />
          <KeyValue label="Back by" value={when(p.returnBy)} />
          <View style={{ paddingVertical: 10, gap: 4 }}>
            <Text variant="caption">Reason</Text>
            <Text variant="body">{p.reason}</Text>
          </View>
        </Card>
      </FadeIn>

      <FadeIn index={3}>
        <Card>
          <Text variant="eyebrow" style={{ marginBottom: 14 }}>Progress</Text>
          <ApprovalTimeline outpass={p} />
        </Card>
      </FadeIn>

      {vm.canDecide ? (
        <FadeIn index={4} style={{ gap: 8 }}>
          {vm.needsOverrideReason ? (
            <View style={styles.override}>
              <Ionicons name="shield-checkmark-outline" size={18} color={color.goldText} />
              <Text variant="caption" style={{ flex: 1, color: color.goldText }}>
                The parent hasn't responded yet. Approving now overrides their step and is logged with your reason.
              </Text>
            </View>
          ) : null}
          <Field
            label={vm.needsOverrideReason ? "Reason for deciding now" : "Note (optional)"}
            placeholder={vm.needsOverrideReason ? "e.g. Parent confirmed by phone" : "Add a note for the student"}
            value={reason}
            onChangeText={setReason}
          />
        </FadeIn>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 10 },
  who: { flexDirection: "row", alignItems: "center", gap: 12 },
  overdue: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 14, backgroundColor: color.redSoft },
  override: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 14, backgroundColor: color.goldSoft, borderWidth: 1, borderColor: color.goldLight },
});
