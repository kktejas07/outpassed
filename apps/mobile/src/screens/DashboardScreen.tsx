import { SosBanner } from "../components/SosBanner";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { QuickActions } from "../ui/QuickActions";
import { OutpassCard } from "../components/OutpassCard";
import { useDashboard } from "../features/admin/useAdmin";
import { Empty, ErrorNote, Loading, SectionTitle, Stat } from "../ui/bits";
import { FadeIn } from "../ui/motion";
import { Screen } from "../ui/Screen";

export function DashboardScreen() {
  const vm = useDashboard();
  const s = vm.summary;
  return (
    <Screen
      hero={{
        greeting: "Live · refreshes every 30 s",
        title: "Campus now",
        headline: "Campus now\nat a glance",
        chip: s
          ? { label: `${s.outNow} out · ${s.overdue} overdue · ${s.visitorsOnSite} visitors`, tone: s.overdue || s.openSos ? "danger" : "safe" }
          : undefined,
      }}
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      bell
    >
      <SosBanner />
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}
      {s ? (
        <>
          <View style={styles.grid}>
            <FadeIn index={0} style={styles.cell}><Stat icon="walk-outline" label="Out of campus" value={s.outNow} /></FadeIn>
            <FadeIn index={1} style={styles.cell}><Stat icon="alarm-outline" label="Overdue" value={s.overdue} tone="red" /></FadeIn>
            <FadeIn index={2} style={styles.cell}><Stat icon="hourglass-outline" label="Pending approvals" value={s.pendingApprovals} tone="accent" /></FadeIn>
            <FadeIn index={3} style={styles.cell}><Stat icon="people-outline" label="Visitors on site" value={s.visitorsOnSite} tone="green" /></FadeIn>
          </View>
          <View style={styles.grid}>
            <FadeIn index={4} style={styles.cell}><Stat icon="swap-horizontal-outline" label="Gate movements today" value={s.movementsToday} /></FadeIn>
            <FadeIn index={5} style={styles.cell}><Stat icon="time-outline" label="Asking for more time" value={s.extensionRequests} tone="accent" /></FadeIn>
            <FadeIn index={6} style={styles.cell}><Stat icon="cube-outline" label="Parcels at the gate" value={s.parcelsWaiting} /></FadeIn>
            <FadeIn index={7} style={styles.cell}><Stat icon="alert-circle-outline" label="Open SOS" value={s.openSos} tone="red" /></FadeIn>
          </View>
          <FadeIn index={8}>
            <QuickActions
              actions={[
                { key: "rollcall", label: "Roll call", icon: "moon-outline", onPress: () => router.push("/rollcall") },
                { key: "reports", label: "Reports", icon: "document-text-outline", onPress: () => router.push("/reports") },
                { key: "notices", label: "Notice board", icon: "megaphone-outline", onPress: () => router.push("/notices") },
                { key: "sos", label: "SOS alerts", icon: "alert-circle", tone: "danger", badge: s.openSos, onPress: () => router.push("/sos") },
                { key: "invite", label: "Invite visitor", icon: "person-add-outline", onPress: () => router.push("/visit/new") },
              ]}
            />
          </FadeIn>
          <SectionTitle title={`Overdue · ${s.overdue}`} />
          {s.overdueList.length === 0 ? (
            <Empty icon="shield-checkmark-outline" title="Everyone's on time" body="Students who miss their return time will show here." />
          ) : (
            s.overdueList.map((o, i) => (
              <FadeIn key={o.id} index={i + 5}>
                <OutpassCard outpass={o} showStudent />
              </FadeIn>
            ))
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  cell: { flexGrow: 1, flexBasis: "45%", flexDirection: "row" },
});
