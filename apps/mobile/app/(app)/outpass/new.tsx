import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";
import { durationPresets, leavePresets, useNewOutpass } from "../../../src/features/outpass/useNewOutpass";
import { outpassTypes, when } from "../../../src/lib/format";
import { color, radius } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Chips, ErrorNote, KeyValue } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn, PopIn } from "../../../src/ui/motion";
import { useSession } from "../../../src/auth/session";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

export default function NewOutpass() {
  const vm = useNewOutpass();
  const day = useSession().user?.student?.residence === "DAY_SCHOLAR";
  return (
    <Screen
      title="Request outpass"
      eyebrow="New"
      back
      footer={<Button label="Send for approval" icon="paper-plane-outline" loading={vm.submitting} onPress={vm.submit} />}
    >
      <FadeIn index={0} style={{ gap: 10 }}>
        <Text variant="eyebrow">Why are you going out?</Text>
        <Chips options={outpassTypes} value={vm.type} onChange={vm.setType} />
        {vm.type === "EMERGENCY" ? (
          <PopIn style={styles.emergency}>
            <Ionicons name="alert-circle" size={18} color={color.red} />
            <Text variant="caption" style={{ flex: 1, color: color.ink }}>{day ? "Emergency requests go straight to your HOD. Your parents are told at once." : "Emergency requests go straight to the warden. Your parents and faculty are told at once."}</Text>
          </PopIn>
        ) : null}
      </FadeIn>
      {vm.hasFaculty && vm.type !== "EMERGENCY" ? (
        <FadeIn index={1} style={{ gap: 10 }}>
          <Text variant="eyebrow">Who gave you permission?</Text>
          {vm.chosenFaculty ? (
            <View style={styles.chosen}>
              <View style={styles.facIcon}><Ionicons name="school" size={16} color={color.white} /></View>
              <View style={{ flex: 1 }}>
                <Text variant="label">{vm.chosenFaculty.name}</Text>
                <Text variant="caption">{[vm.chosenFaculty.isHod ? "HOD" : "Faculty", vm.chosenFaculty.department].filter(Boolean).join(" · ")} · approves first</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Change" hitSlop={8} onPress={() => vm.setFacultyId("")}>
                <Text variant="label" style={{ color: color.indigo }}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Field label="Faculty or HOD" placeholder="Search by name or department" value={vm.facultyQuery} onChangeText={vm.setFacultyQuery} />
              <View style={styles.facList}>
                {vm.faculty.map((f) => (
                  <Pressable key={f.id} accessibilityRole="button" onPress={() => vm.setFacultyId(f.id)} style={({ pressed }) => [styles.facRow, pressed && { backgroundColor: color.indigoTint }]}>
                    <View style={{ flex: 1 }}>
                      <Text variant="label">{f.name}</Text>
                      <Text variant="caption">{[f.isHod ? "HOD" : null, f.department, f.mine ? "your department" : null].filter(Boolean).join(" · ") || "Faculty"}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={color.muted} />
                  </Pressable>
                ))}
              </View>
              <Text variant="caption">{day
                  ? "Skip this and your HOD approves it. Your parent is told either way; there's no warden step for day scholars."
                  : "Skip this if no one has given you permission yet; the request will go to your parent and warden."}</Text>
            </View>
          )}
        </FadeIn>
      ) : null}
      <FadeIn index={1} style={{ gap: 14 }}>
        <Field label="Where are you going?" placeholder="e.g. City Mall, Home – Vijayawada" value={vm.destination} onChangeText={vm.setDestination} error={vm.errors.destination} />
        <Field label="Reason" placeholder={day ? "A short note for your faculty" : "A short note for your parent and warden"} value={vm.reason} onChangeText={vm.setReason} multiline error={vm.errors.reason} />
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

const styles = StyleSheet.create({
  emergency: { flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderRadius: radius.md, backgroundColor: color.redSoft },
  chosen: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: color.white, borderWidth: 1.5, borderColor: color.accentLight },
  facIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: color.indigo, alignItems: "center", justifyContent: "center" },
  facList: { borderRadius: radius.md, backgroundColor: color.white, overflow: "hidden" },
  facRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: color.line },
});
