import { Pressable, StyleSheet, View } from "react-native";
import { regularHours, regularSpans, useInviteVisitor, visitWindows, weekdays } from "../../../src/features/visits/useVisits";
import { color, font, radius } from "../../../src/theme/tokens";
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
      {vm.window === "regular" ? (
        <FadeIn index={4} style={styles.regular}>
          <Text variant="label">One pass for every visit</Text>
          <Text variant="caption">For a parent who visits every Sunday, say. The same code works on these days and hours, and the guard can see it's a regular pass.</Text>
          <View style={styles.days}>
            {weekdays.map((d, i) => {
              const on = vm.days.includes(i);
              return (
                <Pressable key={d} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={d} onPress={() => vm.toggleDay(i)} style={[styles.day, on && styles.dayOn]}>
                  <Text style={[styles.dayText, on && { color: color.white }]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="eyebrow">Hours</Text>
          <Chips options={regularHours.map((h) => ({ value: h.value, label: h.label }))} value={vm.dailyHours} onChange={vm.setDailyHours} />
          <Text variant="eyebrow">For</Text>
          <Chips options={regularSpans.map((s) => ({ value: s.value, label: s.label }))} value={vm.span} onChange={vm.setSpan} />
          {vm.days.length === 0 ? <Text variant="caption" style={{ color: color.red }}>Pick at least one day</Text> : null}
        </FadeIn>
      ) : null}
      {vm.submitError ? <ErrorNote message={vm.submitError} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  regular: { gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: color.indigoTint },
  days: { flexDirection: "row", gap: 6 },
  day: { flex: 1, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: color.white, borderWidth: 1, borderColor: color.line },
  dayOn: { backgroundColor: color.indigo, borderColor: color.indigo },
  dayText: { fontFamily: font.bodyBold, fontSize: 12.5, color: color.ink },
});
