import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { StyleSheet } from "react-native";
import { color } from "../theme/tokens";
import { Card } from "../ui/Card";
import { Text } from "../ui/Text";
import { SosBanner } from "../components/SosBanner";
import { ConsentCard } from "../components/ConsentCard";
import { OutpassCard } from "../components/OutpassCard";
import { useApprovalQueue } from "../features/approvals/useApprovalQueue";
import { useSession } from "../auth/session";
import { greeting } from "../lib/format";
import { Empty, ErrorNote, Loading, SectionTitle, Segmented } from "../ui/bits";
import { FadeIn } from "../ui/motion";
import { Screen } from "../ui/Screen";

export function ApprovalQueueScreen() {
  const vm = useApprovalQueue();
  const { user } = useSession();
  const waitingCount = vm.tab === "waiting" ? vm.items.length : undefined;
  return (
    <Screen
      hero={{
        greeting: greeting(),
        title: user?.name ?? "Approvals",
        chip: waitingCount
          ? { label: `${waitingCount} request${waitingCount > 1 ? "s" : ""} waiting on you`, tone: "warn" }
          : { label: vm.isWarden ? "No requests waiting" : "All caught up", tone: "safe" },
      }}
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      bell
    >
      {user?.role === "PARENT" ? <ConsentCard /> : null}
      {vm.isWarden ? <SosBanner /> : (
        <Card onPress={() => router.push("/notices")} style={styles.link}>
          <Ionicons name="megaphone-outline" size={20} color={color.indigo} />
          <Text variant="label" style={{ flex: 1 }}>Hostel notice board</Text>
          <Ionicons name="chevron-forward" size={18} color={color.muted} />
        </Card>
      )}
      <Card style={{ padding: 6 }}>
        <Segmented
          options={[
            { value: "waiting", label: "Waiting on you" },
            { value: "all", label: "All requests" },
          ]}
          value={vm.tab}
          onChange={vm.setTab}
        />
      </Card>
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}
      {!vm.loading && vm.items.length === 0 ? (
        <Empty icon="checkmark-done-circle-outline" title={vm.tab === "waiting" ? "All caught up" : "No requests yet"} body={vm.tab === "waiting" ? "New outpass requests will appear here." : undefined} />
      ) : null}

      {vm.isWarden && vm.tab === "waiting" ? (
        <>
          {vm.askingMoreTime.length ? <SectionTitle title={`Asking for more time · ${vm.askingMoreTime.length}`} /> : null}
          {vm.askingMoreTime.map((o, i) => (
            <FadeIn key={o.id} index={i}>
              <OutpassCard outpass={o} showStudent />
            </FadeIn>
          ))}
          {vm.readyForWarden.length ? <SectionTitle title={`Ready for you · ${vm.readyForWarden.length}`} /> : null}
          {vm.readyForWarden.map((o, i) => (
            <FadeIn key={o.id} index={i}>
              <OutpassCard outpass={o} showStudent />
            </FadeIn>
          ))}
          {vm.withParent.length ? <SectionTitle title={`Still with faculty or parent · ${vm.withParent.length}`} /> : null}
          {vm.withParent.map((o, i) => (
            <FadeIn key={o.id} index={i + vm.readyForWarden.length}>
              <OutpassCard outpass={o} showStudent />
            </FadeIn>
          ))}
        </>
      ) : (
        vm.items.map((o, i) => (
          <FadeIn key={o.id} index={i}>
            <OutpassCard outpass={o} showStudent />
          </FadeIn>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ link: { flexDirection: "row", alignItems: "center", gap: 12 } });
