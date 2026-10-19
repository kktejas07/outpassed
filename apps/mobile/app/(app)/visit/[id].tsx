import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, Share } from "react-native";
import { describeRepeat } from "@outpassed/shared/passToken";
import { InvitePass } from "../../../src/components/InvitePass";
import { useVisitDetail } from "../../../src/features/visits/useVisits";
import { visitorTypes, visitStatus, when } from "../../../src/lib/format";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { ErrorNote, KeyValue, Loading } from "../../../src/ui/bits";
import { FadeIn, PopIn } from "../../../src/ui/motion";
import { Pill } from "../../../src/ui/Pill";
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
    ? `Hi ${v.visitorName.split(" ")[0]}, ${v.host.name} has invited you to campus for ${when(v.validFrom)} – ${when(v.validTo)}.\n\nOpen your pass and show the QR at the gate, or tell the guard the code ${v.code}:\n${v.passUrl}`
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
          <InvitePass hostName={v.host.name} qrToken={vm.qr.token} code={v.code} validFrom={v.validFrom} validTo={v.validTo} repeat={v.repeat} />
        </PopIn>
      ) : null}
      {vm.qr ? (
        <FadeIn index={1}>
          <Text variant="caption" style={{ textAlign: "center" }}>
            Sharing sends {v.visitorName.split(" ")[0]} a link to this pass. They don't need the app.
          </Text>
        </FadeIn>
      ) : null}
      <FadeIn index={1}>
        <Card style={{ paddingVertical: 6 }}>
          <KeyValue label="Meeting" value={v.host.name} />
          <KeyValue label="Phone" value={v.visitorPhone} />
          <KeyValue label="Purpose" value={v.purpose} />
          <KeyValue label="Entry code" value={v.code} />
          {v.repeat ? <KeyValue label="Regular pass" value={describeRepeat(v.repeat)} /> : null}
          <KeyValue label="From" value={when(v.validFrom)} />
          <KeyValue label="Until" value={when(v.validTo)} />
          {v.checkedInAt ? <KeyValue label="Arrived" value={when(v.checkedInAt)} /> : null}
          {v.checkedOutAt ? <KeyValue label="Left" value={when(v.checkedOutAt)} /> : null}
        </Card>
      </FadeIn>
    </Screen>
  );
}
