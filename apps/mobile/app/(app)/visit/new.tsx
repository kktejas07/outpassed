import { useInviteVisitor, visitWindows } from "../../../src/features/visits/useVisits";
import { visitorTypes } from "../../../src/lib/format";
import { Button } from "../../../src/ui/Button";
import { Chips, ErrorNote } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn } from "../../../src/ui/motion";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

export default function InviteVisitor() {
  const vm = useInviteVisitor();
  return (
    <Screen
      title="Invite a visitor"
      eyebrow="Visitor pass"
      back
      footer={<Button label="Create pass" icon="ticket-outline" loading={vm.submitting} onPress={vm.submit} />}
    >
      <FadeIn index={0} style={{ gap: 14 }}>
        <Field label="Visitor's name" placeholder="Full name" value={vm.visitorName} onChangeText={vm.setVisitorName} error={vm.errors.visitorName} />
        <Field label="Phone" placeholder="+91 98xxx xxxxx" keyboardType="phone-pad" value={vm.visitorPhone} onChangeText={vm.setVisitorPhone} error={vm.errors.visitorPhone} />
      </FadeIn>
      <FadeIn index={1} style={{ gap: 10 }}>
        <Text variant="eyebrow">Visitor type</Text>
        <Chips options={visitorTypes} value={vm.visitorType} onChange={vm.setVisitorType} />
      </FadeIn>
      <FadeIn index={2}>
        <Field label="Purpose" placeholder="e.g. Guest lecture, parent meeting" value={vm.purpose} onChangeText={vm.setPurpose} error={vm.errors.purpose} />
      </FadeIn>
      <FadeIn index={3} style={{ gap: 10 }}>
        <Text variant="eyebrow">When</Text>
        <Chips options={visitWindows.map((w) => ({ value: w.value, label: w.label }))} value={vm.window} onChange={vm.setWindow} />
      </FadeIn>
      {vm.submitError ? <ErrorNote message={vm.submitError} /> : null}
    </Screen>
  );
}
