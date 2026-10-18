import { View } from "react-native";
import { durationPresets, leavePresets, useNewOutpass } from "../../../src/features/outpass/useNewOutpass";
import { outpassTypes, when } from "../../../src/lib/format";
import { color } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Chips, ErrorNote, KeyValue } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn } from "../../../src/ui/motion";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

export default function NewOutpass() {
  const vm = useNewOutpass();
  return (
    <Screen
      title="Request outpass"
      eyebrow="New"
      back
      footer={<Button label="Send for approval" icon="paper-plane-outline" loading={vm.submitting} onPress={vm.submit} />}
    >
      <FadeIn index={0} style={{ gap: 10 }}>
        <Text variant="eyebrow">Type</Text>
        <Chips options={outpassTypes} value={vm.type} onChange={vm.setType} />
      </FadeIn>
      <FadeIn index={1} style={{ gap: 14 }}>
        <Field label="Where are you going?" placeholder="e.g. City Mall, Home – Vijayawada" value={vm.destination} onChangeText={vm.setDestination} error={vm.errors.destination} />
        <Field label="Reason" placeholder="A short note for your parent and warden" value={vm.reason} onChangeText={vm.setReason} multiline error={vm.errors.reason} />
      </FadeIn>
      <FadeIn index={2} style={{ gap: 10 }}>
        <Text variant="eyebrow">Leaving</Text>
        <Chips options={leavePresets} value={vm.leave} onChange={vm.setLeave} />
      </FadeIn>
      <FadeIn index={3} style={{ gap: 10 }}>
        <Text variant="eyebrow">How long</Text>
        <Chips options={durationPresets} value={vm.duration} onChange={vm.setDuration} />
      </FadeIn>
      <FadeIn index={4}>
        <Card style={{ paddingVertical: 6, backgroundColor: color.accentSoft, borderColor: color.accentLight }}>
          <KeyValue label="Leave from" value={when(vm.times.leaveAt)} />
          <View style={{ borderBottomWidth: 0 }}>
            <KeyValue label="Back by" value={when(vm.times.returnBy)} />
          </View>
        </Card>
      </FadeIn>
      {vm.submitError ? <ErrorNote message={vm.submitError} /> : null}
    </Screen>
  );
}
