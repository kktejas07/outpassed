import { OutpassCard } from "../components/OutpassCard";
import { useApprovalQueue } from "../features/approvals/useApprovalQueue";
import { Empty, ErrorNote, Loading, SectionTitle, Segmented } from "../ui/bits";
import { FadeIn } from "../ui/motion";
import { Screen } from "../ui/Screen";

export function ApprovalQueueScreen() {
  const vm = useApprovalQueue();
  const waitingCount = vm.tab === "waiting" ? vm.items.length : undefined;
  return (
    <Screen
      title="Approvals"
      eyebrow={waitingCount ? `${waitingCount} waiting on you` : vm.isWarden ? "Hostel requests" : "Your child's requests"}
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
    >
      <Segmented
        options={[
          { value: "waiting", label: "Waiting" },
          { value: "all", label: "All requests" },
        ]}
        value={vm.tab}
        onChange={vm.setTab}
      />
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}
      {!vm.loading && vm.items.length === 0 ? (
        <Empty icon="checkmark-done-circle-outline" title={vm.tab === "waiting" ? "All caught up" : "No requests yet"} body={vm.tab === "waiting" ? "New outpass requests will appear here." : undefined} />
      ) : null}

      {vm.isWarden && vm.tab === "waiting" ? (
        <>
          {vm.readyForWarden.length ? <SectionTitle title={`Ready for you · ${vm.readyForWarden.length}`} /> : null}
          {vm.readyForWarden.map((o, i) => (
            <FadeIn key={o.id} index={i}>
              <OutpassCard outpass={o} showStudent />
            </FadeIn>
          ))}
          {vm.withParent.length ? <SectionTitle title={`Still with parent · ${vm.withParent.length}`} /> : null}
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
