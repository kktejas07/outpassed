import { StyleSheet, View } from "react-native";
import { OutpassCard } from "../components/OutpassCard";
import { useDashboard } from "../features/admin/useAdmin";
import { Empty, ErrorNote, Loading, SectionTitle, Stat } from "../ui/bits";
import { FadeIn } from "../ui/motion";
import { Screen } from "../ui/Screen";

export function DashboardScreen() {
  const vm = useDashboard();
  const s = vm.summary;
  return (
    <Screen title="Campus now" eyebrow="Live · refreshes every 30 s" refreshing={vm.refreshing} onRefresh={vm.refresh} bell>
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}
      {s ? (
        <>
          <View style={styles.grid}>
            <FadeIn index={0} style={styles.cell}><Stat icon="walk-outline" label="Out of campus" value={s.outNow} /></FadeIn>
            <FadeIn index={1} style={styles.cell}><Stat icon="alarm-outline" label="Overdue" value={s.overdue} tone="red" /></FadeIn>
            <FadeIn index={2} style={styles.cell}><Stat icon="hourglass-outline" label="Pending approvals" value={s.pendingApprovals} tone="gold" /></FadeIn>
            <FadeIn index={3} style={styles.cell}><Stat icon="people-outline" label="Visitors on site" value={s.visitorsOnSite} tone="green" /></FadeIn>
          </View>
          <FadeIn index={4} style={styles.wide}><Stat icon="swap-horizontal-outline" label="Gate movements today" value={s.movementsToday} /></FadeIn>
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
  wide: { flexDirection: "row" },
});
