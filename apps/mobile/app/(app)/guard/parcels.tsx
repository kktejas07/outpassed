import Ionicons from "@expo/vector-icons/Ionicons";
import type { ParcelDto } from "@outpassed/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { carriers, useGateParcels } from "../../../src/features/parcels/useParcels";
import { relative, studentLine } from "../../../src/lib/format";
import { color } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Avatar, Chips, Empty, ErrorNote, Loading, Segmented } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn, PopIn } from "../../../src/ui/motion";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

export default function GateParcels() {
  const vm = useGateParcels();
  const [tab, setTab] = useState<"log" | "waiting">("log");
  const [open, setOpen] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const start = (p: ParcelDto) => {
    setOpen(p.id);
    setCode("");
    vm.clearCollectError();
  };

  return (
    <Screen title="Parcels" eyebrow={`${vm.data?.length ?? 0} waiting at the gate`} refreshing={vm.refreshing} onRefresh={vm.refresh} bell>
      <Segmented options={[{ value: "log", label: "Log a parcel" }, { value: "waiting", label: `At gate · ${vm.data?.length ?? 0}` }]} value={tab} onChange={setTab} />
      {tab === "log" ? (
        <FadeIn style={{ gap: 14 }}>
          <Field label="Student's roll number" value={vm.rollNo} onChangeText={vm.setRollNo} autoCapitalize="characters" placeholder="e.g. 21CS104" hint="Printed on the parcel label or ask the delivery person." />
          <Text variant="eyebrow">From</Text>
          <Chips options={carriers.map((c) => ({ value: c, label: c }))} value={vm.carrier} onChange={vm.setCarrier} />
          <Field label="Note (optional)" value={vm.note} onChangeText={vm.setNote} placeholder="e.g. Large box, food — keep upright" />
          {vm.logError ? <ErrorNote message={vm.logError} /> : null}
          <Button label="Log parcel and alert student" icon="cube-outline" loading={vm.logging} disabled={!vm.rollNo.trim()} onPress={vm.logParcel} />
        </FadeIn>
      ) : (
        <>
          <Field label="Find" value={vm.search} onChangeText={vm.setSearch} placeholder="Name or roll number" />
          {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
          {vm.loading ? <Loading /> : null}
          {!vm.loading && vm.list.length === 0 ? <Empty icon="cube-outline" title="Nothing waiting" body="Parcels you log show here until they're collected." /> : null}
          {vm.list.map((p, i) => (
            <FadeIn key={p.id} index={i}>
              <Card style={{ gap: 10 }}>
                <View style={styles.row}>
                  <Avatar name={p.student.name} size={38} tone="accent" />
                  <View style={{ flex: 1 }}>
                    <Text variant="label">{p.student.name}</Text>
                    <Text variant="caption" numberOfLines={1}>{studentLine(p.student) || "Student"}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text variant="label">{p.carrier}</Text>
                    <Text variant="caption">{relative(p.createdAt)}</Text>
                  </View>
                </View>
                {p.note ? <Text variant="caption">{p.note}</Text> : null}
                {open === p.id ? (
                  <PopIn style={{ gap: 10 }}>
                    <Field label="Student's 4-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} placeholder="0000" autoFocus />
                    {vm.collectError ? <ErrorNote message={vm.collectError} /> : null}
                    <View style={styles.row}>
                      <Button style={{ flex: 1 }} tone="outline" label="Cancel" onPress={() => setOpen(null)} />
                      <Button style={{ flex: 1.4 }} tone="success" icon="checkmark" label="Hand over" loading={vm.collecting} disabled={code.length !== 4} onPress={async () => { if (await vm.handOver(p, code)) setOpen(null); }} />
                    </View>
                  </PopIn>
                ) : (
                  <Button compact tone="outline" icon="hand-right-outline" label="Hand over" onPress={() => start(p)} />
                )}
              </Card>
            </FadeIn>
          ))}
        </>
      )}
      <View style={styles.tip}>
        <Ionicons name="shield-checkmark-outline" size={16} color={color.indigo} />
        <Text variant="caption" style={{ flex: 1, color: color.ink }}>Only hand a parcel over when the student's code matches.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  tip: { flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: color.indigoTint },
});
