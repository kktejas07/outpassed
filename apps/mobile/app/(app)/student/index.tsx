import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { BannerCarousel } from "../../../src/components/BannerCarousel";
import { OutpassCard } from "../../../src/components/OutpassCard";
import { PassFeature } from "../../../src/components/PassFeature";
import { useSession } from "../../../src/auth/session";
import { useStudentHome } from "../../../src/features/outpass/useStudentHome";
import { when } from "../../../src/lib/format";
import { color } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { ErrorNote, Loading, SectionTitle } from "../../../src/ui/bits";
import { FadeIn } from "../../../src/ui/motion";
import { QuickActions } from "../../../src/ui/QuickActions";
import { Screen, type Hero } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning," : h < 17 ? "Good afternoon," : "Good evening,";
}

export default function StudentHome() {
  const { user } = useSession();
  const vm = useStudentHome();
  const s = user?.student;
  const room = [s?.hostel, s?.room].filter(Boolean).join(", ");
  const a = vm.active;

  const chip: Hero["chip"] = !a
    ? { label: room ? `On campus · ${room}` : "On campus", tone: "safe" }
    : a.overdue
      ? { label: `Overdue · was due ${when(a.returnBy)}`, tone: "danger" }
      : a.status === "OUT"
        ? { label: `Out · back by ${when(a.returnBy)}`, tone: "info" }
        : a.status === "APPROVED"
          ? { label: `Pass approved · from ${when(a.leaveAt)}`, tone: "safe" }
          : { label: a.status === "PENDING_FACULTY" ? "Waiting for faculty" : a.status === "PENDING_PARENT" ? "Waiting for your parent" : "Waiting for the warden", tone: "warn" };

  return (
    <Screen hero={{ greeting: greeting(), title: user?.name ?? "", headline: a ? (a.status === "OUT" ? "You're out.\nBack on time?" : "Your current\noutpass") : "Heading out?\nPlan your outpass", chip }} refreshing={vm.refreshing} onRefresh={vm.refresh} bell>
      {vm.loading ? (
        <Card><Loading /></Card>
      ) : a ? (
        <FadeIn><PassFeature outpass={a} /></FadeIn>
      ) : (
        <FadeIn>
          <Card style={styles.hero}>
            <Text variant="title">Heading out?</Text>
            <Text variant="body" style={{ color: color.muted }}>Your parent and warden approve on their phones.</Text>
            <Button style={{ marginTop: 6 }} label="Request outpass" onPress={() => router.push("/outpass/new")} />
          </Card>
        </FadeIn>
      )}

      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}

      {!vm.loading ? (
        <FadeIn index={1}>
          <Card>
            <QuickActions
              actions={[
                { key: "visitor", label: "Invite visitor", icon: "person-add-outline", onPress: () => router.push("/visit/new") },
                { key: "parcels", label: "Parcels", icon: "cube-outline", badge: vm.parcelsWaiting, onPress: () => router.push("/parcels") },
                { key: "notices", label: "Notices", icon: "megaphone-outline", badge: vm.unreadNotices, onPress: () => router.push("/notices") },
                { key: "history", label: "History", icon: "time-outline", onPress: () => router.push("/student/history") },
                { key: "sos", label: "SOS", icon: "alert-circle", tone: "danger", onPress: () => router.push("/sos") },
              ]}
            />
          </Card>
        </FadeIn>
      ) : null}

      {!vm.loading ? <BannerCarousel /> : null}

      {vm.parcelsWaiting ? (
        <FadeIn index={2}>
          <Card onPress={() => router.push("/parcels")} style={styles.row}>
            <View style={[styles.circle, { backgroundColor: color.accent }]}><Ionicons name="cube" size={20} color={color.white} /></View>
            <View style={{ flex: 1 }}>
              <Text variant="heading">{vm.parcelsWaiting === 1 ? "A parcel is waiting" : `${vm.parcelsWaiting} parcels are waiting`}</Text>
              <Text variant="caption">At the gate · tap for your collection code</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={color.faint} />
          </Card>
        </FadeIn>
      ) : null}

      {vm.latestNotice ? (
        <FadeIn index={3}>
          <Card onPress={() => router.push("/notices")} style={styles.row}>
            <View style={styles.circle}><Ionicons name="megaphone" size={19} color={color.white} /></View>
            <View style={{ flex: 1 }}>
              <Text variant="heading" numberOfLines={1}>{vm.latestNotice.title}</Text>
              <Text variant="caption" numberOfLines={1}>New notice · {vm.latestNotice.body}</Text>
            </View>
            <View style={styles.dot} />
          </Card>
        </FadeIn>
      ) : null}

      {vm.history.length > 0 ? (
        <>
          <SectionTitle title="Recent" action={{ label: "See all", onPress: () => router.push("/student/history") }} />
          {vm.history.slice(0, 4).map((o, i) => (
            <FadeIn key={o.id} index={i + 3}>
              <OutpassCard outpass={o} />
            </FadeIn>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 6, paddingVertical: 22 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  circle: { width: 46, height: 46, borderRadius: 23, backgroundColor: color.indigoDeep, alignItems: "center", justifyContent: "center" },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: color.accentLight },
});
