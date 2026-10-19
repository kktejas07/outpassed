import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";
import { PhotoCapture } from "../../../src/components/PhotoCapture";
import { useWalkIn } from "../../../src/features/visits/useVisits";
import { visitorTypes } from "../../../src/lib/format";
import { color, radius } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Avatar, Chips, ErrorNote } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn, PopIn } from "../../../src/ui/motion";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

export default function WalkIn() {
  const vm = useWalkIn();

  if (vm.created) {
    return (
      <Screen title="Walk-in" eyebrow="Visitor at the gate">
        <PopIn style={styles.done}>
          <View style={styles.doneIcon}>
            <Ionicons name="hourglass-outline" size={30} color={color.accentText} />
          </View>
          <Text variant="title">Sent to host</Text>
          <Text variant="caption" style={{ textAlign: "center" }}>{vm.created} Scan their visit from the host's pass once approved, or check Visitors.</Text>
          <Button style={{ alignSelf: "stretch" }} label="Register another" onPress={vm.reset} />
        </PopIn>
      </Screen>
    );
  }

  return (
    <Screen
      title="Walk-in"
      eyebrow="Visitor at the gate"
      footer={<Button label="Ask host to approve" icon="paper-plane-outline" loading={vm.submitting} onPress={vm.submit} />}
    >
      <FadeIn index={0} style={{ gap: 14 }}>
        <Field label="Visitor's name" placeholder="Full name" value={vm.visitorName} onChangeText={vm.setVisitorName} error={vm.errors.visitorName} />
        <Field label="Phone" placeholder="+91 98xxx xxxxx" keyboardType="phone-pad" value={vm.visitorPhone} onChangeText={vm.setVisitorPhone} error={vm.errors.visitorPhone} />
        <Field label="Roll number or ID (optional)" placeholder="e.g. a student from another college" autoCapitalize="characters" value={vm.idNumber} onChangeText={vm.setIdNumber} />
        <PhotoCapture value={vm.photo} onChange={vm.setPhoto} label="Visitor's photo" hint="The host sees it before letting them in." />
      </FadeIn>
      <FadeIn index={1} style={{ gap: 10 }}>
        <Text variant="eyebrow">Visitor type</Text>
        <Chips options={visitorTypes} value={vm.visitorType} onChange={vm.setVisitorType} />
      </FadeIn>
      <FadeIn index={2}>
        <Field label="Purpose" placeholder="e.g. Parcel delivery, meeting" value={vm.purpose} onChangeText={vm.setPurpose} error={vm.errors.purpose} />
      </FadeIn>
      <FadeIn index={3} style={{ gap: 8 }}>
        <Field label="Here to meet" placeholder="Faculty, student name or roll no." value={vm.host ? `${vm.host.name}${vm.host.detail ? ` · ${vm.host.detail}` : ""}` : vm.hostQuery} onChangeText={(t) => { vm.setHost(null); vm.setHostQuery(t); }} error={vm.errors.host} hint={vm.host ? "They'll get an alert to let the visitor in." : undefined} />
        {!vm.host
          ? vm.hosts.slice(0, 6).map((h) => (
              <Pressable key={h.id} onPress={() => vm.setHost(h)} style={styles.host} accessibilityRole="button">
                <Avatar name={h.name} size={32} />
                <View style={{ flex: 1 }}>
                  <Text variant="label">{h.name}</Text>
                  <Text variant="caption" numberOfLines={1}>{h.detail ?? h.role.toLowerCase()}</Text>
                </View>
                {h.role === "FACULTY" ? <Ionicons name="school-outline" size={16} color={color.indigo} /> : null}
              </Pressable>
            ))
          : null}
      </FadeIn>
      {vm.submitError ? <ErrorNote message={vm.submitError} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  host: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.md, backgroundColor: color.white, borderWidth: 1, borderColor: color.line },
  done: { backgroundColor: color.white, borderRadius: radius.lg, borderWidth: 1, borderColor: color.accentLight, padding: 24, alignItems: "center", gap: 12 },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: color.accentSoft, alignItems: "center", justifyContent: "center" },
});
