import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, Share, StyleSheet, View } from "react-native";
import { useVisitDetail } from "../../../src/features/visits/useVisits";
import { visitorTypes, visitStatus, when } from "../../../src/lib/format";
import { color, shadow } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { ErrorNote, KeyValue, Loading } from "../../../src/ui/bits";
import { FadeIn, PopIn } from "../../../src/ui/motion";
import { Pill } from "../../../src/ui/Pill";
import { QrCode } from "../../../src/ui/QrCode";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

export default function VisitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useVisitDetail(id);
  const [copied, setCopied] = useState(false);
  const v = vm.visit;
  if (!v) {
    return (
      <Screen title="Visitor" back>
        {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : <Loading />}
      </Screen>
    );
  }
  const s = visitStatus(v);
  const message = vm.qr
    ? `Your Outpass visitor pass for ${when(v.validFrom)}–${when(v.validTo)}.\nShow this code at the gate:\n${vm.qr.token}`
    : "";
  const share = async () => {
    if (!vm.qr) return;
    // Desktop browsers often have no share sheet: copy the pass instead.
    if (Platform.OS === "web" && !(globalThis.navigator as Navigator | undefined)?.share) {
      try {
        await globalThis.navigator?.clipboard?.writeText(message);
        setCopied(true);
      } catch {
        setCopied(false);
      }
      return;
    }
    await Share.share({ message }).catch(() => undefined);
  };

  return (
    <Screen
      title={v.visitorName}
      eyebrow={visitorTypes.find((t) => t.value === v.visitorType)?.label ?? "Visitor"}
      back
      right={<Pill label={s.label} tone={s.tone} />}
      footer={vm.qr ? <Button icon={copied ? "checkmark" : "share-social-outline"} label={copied ? "Copied — paste it to the visitor" : "Share pass with visitor"} onPress={share} /> : undefined}
    >
      {vm.qr ? (
        <PopIn>
          <View style={[styles.frame, shadow.gold]}>
            <View style={styles.pass}>
              <QrCode value={vm.qr.token} size={200} />
              <Text variant="caption" style={{ textAlign: "center" }}>The guard scans this at the gate</Text>
            </View>
          </View>
        </PopIn>
      ) : null}
      <FadeIn index={1}>
        <Card style={{ paddingVertical: 6 }}>
          <KeyValue label="Meeting" value={v.host.name} />
          <KeyValue label="Phone" value={v.visitorPhone} />
          <KeyValue label="Purpose" value={v.purpose} />
          <KeyValue label="From" value={when(v.validFrom)} />
          <KeyValue label="Until" value={when(v.validTo)} />
          {v.checkedInAt ? <KeyValue label="Arrived" value={when(v.checkedInAt)} /> : null}
          {v.checkedOutAt ? <KeyValue label="Left" value={when(v.checkedOutAt)} /> : null}
        </Card>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 24, padding: 3, backgroundColor: color.goldFrame, alignSelf: "center" },
  pass: { backgroundColor: color.white, borderRadius: 21, padding: 18, alignItems: "center", gap: 10 },
});
