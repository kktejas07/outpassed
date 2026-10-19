import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { VisitCard } from "../components/VisitCard";
import { useVisitList } from "../features/visits/useVisits";
import { useSession } from "../auth/session";
import { Button } from "../ui/Button";
import { Empty, ErrorNote, Loading, Segmented } from "../ui/bits";
import { FadeIn } from "../ui/motion";
import { Screen } from "../ui/Screen";

/** Hosts: invite visitors and approve walk-ins. Staff also see everyone on site. */
export function VisitorsScreen() {
  const { user } = useSession();
  const vm = useVisitList("all");
  return (
    <Screen
      title="Visitors"
      eyebrow={user?.role === "STUDENT" ? "People coming to see you" : "Guests, vendors, parents"}
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      bell
      right={<Button compact icon="add" label="Invite" onPress={() => router.push("/visit/new")} />}
    >
      <Segmented
        options={[
          { value: "all", label: "All" },
          { value: "pending", label: "To approve" },
          { value: "onsite", label: "On campus" },
        ]}
        value={vm.tab}
        onChange={vm.setTab}
      />
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.decideError ? <ErrorNote message={vm.decideError} /> : null}
      {vm.loading ? <Loading /> : null}
      {!vm.loading && vm.visits.length === 0 ? (
        <Empty icon="people-outline" title="No visitors" body="Invite someone and share their pass, or approve walk-ins the gate sends you." />
      ) : null}
      {vm.visits.map((v, i) => (
        <FadeIn key={v.id} index={i}>
          <VisitCard visit={v} onPress={() => router.push(`/visit/${v.id}`)}>
            {v.status === "PENDING_HOST" && v.host.id === user?.id ? (
              <View style={styles.actions}>
                <Button compact style={{ flex: 1 }} tone="danger" label="Decline" loading={vm.deciding} onPress={() => vm.decide(v.id, "REJECT")} />
                <Button compact style={{ flex: 1 }} tone="accent" label="Let them in" loading={vm.deciding} onPress={() => vm.decide(v.id, "APPROVE")} />
              </View>
            ) : null}
          </VisitCard>
        </FadeIn>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({ actions: { flexDirection: "row", gap: 10, marginTop: 4 } });
