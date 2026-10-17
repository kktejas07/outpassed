import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { OutpassCard } from "../../../src/components/OutpassCard";
import { useSession } from "../../../src/auth/session";
import { useStudentHome } from "../../../src/features/outpass/useStudentHome";
import { color } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Empty, ErrorNote, Loading, SectionTitle } from "../../../src/ui/bits";
import { FadeIn } from "../../../src/ui/motion";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function StudentHome() {
  const { user } = useSession();
  const vm = useStudentHome();
  const first = user?.name.split(" ")[0] ?? "";

  return (
    <Screen
      title={`${greeting()}, ${first}`}
      eyebrow={[user?.student?.hostel, user?.student?.room ? `Room ${user.student.room}` : null].filter(Boolean).join(" · ") || "Outpass"}
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
    >
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}

      {!vm.loading && vm.active ? (
        <FadeIn>
          <SectionTitle title="Current pass" />
          <View style={{ height: 8 }} />
          <OutpassCard outpass={vm.active} />
          {vm.active.status === "APPROVED" || vm.active.status === "OUT" ? (
            <Button style={{ marginTop: 12 }} icon="qr-code-outline" label="Show gate pass" onPress={() => router.push(`/outpass/${vm.active!.id}`)} />
          ) : null}
        </FadeIn>
      ) : null}

      {!vm.loading && !vm.active ? (
        <FadeIn>
          <Card style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="navigate" size={22} color={color.goldText} />
            </View>
            <Text variant="title">Heading out?</Text>
            <Text variant="caption" style={{ textAlign: "center" }}>
              Request an outpass. Your parent and warden approve it, then show the QR at the gate.
            </Text>
            <Button style={{ alignSelf: "stretch", marginTop: 6 }} icon="add" label="Request outpass" onPress={() => router.push("/outpass/new")} />
          </Card>
        </FadeIn>
      ) : null}

      {vm.history.length > 0 ? (
        <>
          <SectionTitle title="Recent" action={{ label: "See all", onPress: () => router.push("/student/history") }} />
          {vm.history.slice(0, 4).map((o, i) => (
            <FadeIn key={o.id} index={i + 1}>
              <OutpassCard outpass={o} />
            </FadeIn>
          ))}
        </>
      ) : !vm.loading && !vm.active ? (
        <Empty icon="sparkles-outline" title="No trips yet" body="Your past outpasses will appear here." />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 8, paddingVertical: 24, borderColor: color.goldLight, backgroundColor: color.white },
  heroIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: color.goldSoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
});
