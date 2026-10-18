import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { useMyParcels } from "../../../src/features/parcels/useParcels";
import { relative, when } from "../../../src/lib/format";
import { color, font, radius } from "../../../src/theme/tokens";
import { Card } from "../../../src/ui/Card";
import { Empty, ErrorNote, Loading, SectionTitle } from "../../../src/ui/bits";
import { FadeIn, PopIn } from "../../../src/ui/motion";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

/** Student: parcels waiting at the gate, with the code to collect them. */
export default function MyParcels() {
  const vm = useMyParcels();
  return (
    <Screen title="Parcels" eyebrow={vm.waiting.length ? `${vm.waiting.length} at the gate` : "Deliveries"} back refreshing={vm.refreshing} onRefresh={vm.refresh}>
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}
      {!vm.loading && vm.waiting.length === 0 && vm.done.length === 0 ? (
        <Empty icon="cube-outline" title="No parcels yet" body="When a delivery for you reaches the gate, the guard logs it and you get a code here." />
      ) : null}
      {vm.waiting.map((p, i) => (
        <PopIn key={p.id}>
          <Card style={styles.waiting} accent={color.accent}>
            <View style={styles.row}>
              <View style={styles.icon}><Ionicons name="cube" size={20} color={color.accentText} /></View>
              <View style={{ flex: 1 }}>
                <Text variant="heading">{p.carrier}</Text>
                <Text variant="caption">At the gate since {when(p.createdAt)}{p.note ? ` · ${p.note}` : ""}</Text>
              </View>
            </View>
            <Text variant="caption" style={{ textAlign: "center" }}>Show this code to the guard</Text>
            <View style={styles.code} accessibilityLabel={`Collection code ${p.code?.split("").join(" ")}`}>
              <Text style={styles.codeText}>{p.code}</Text>
            </View>
          </Card>
          {i === vm.waiting.length - 1 ? <View style={{ height: 4 }} /> : null}
        </PopIn>
      ))}
      {vm.done.length ? <SectionTitle title="Collected" /> : null}
      {vm.done.map((p, i) => (
        <FadeIn key={p.id} index={i}>
          <Card style={styles.row}>
            <View style={[styles.icon, { backgroundColor: color.greenSoft }]}><Ionicons name="checkmark" size={18} color={color.green} /></View>
            <View style={{ flex: 1 }}>
              <Text variant="label">{p.carrier}</Text>
              <Text variant="caption">Collected {p.collectedAt ? relative(p.collectedAt) : ""}</Text>
            </View>
          </Card>
        </FadeIn>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  waiting: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: color.accentSoft, alignItems: "center", justifyContent: "center" },
  code: { alignSelf: "center", backgroundColor: color.ink, borderRadius: radius.md, paddingHorizontal: 28, paddingVertical: 10, borderWidth: 2, borderColor: color.accentFrame },
  codeText: { fontFamily: font.display, fontSize: 34, letterSpacing: 10, color: color.white },
});
