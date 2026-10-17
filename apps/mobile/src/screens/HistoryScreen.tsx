import { OutpassCard } from "../components/OutpassCard";
import { api } from "../api/client";
import { useSession } from "../auth/session";
import { useQuery } from "../lib/useQuery";
import { Empty, ErrorNote, Loading } from "../ui/bits";
import { FadeIn } from "../ui/motion";
import { Screen } from "../ui/Screen";

/** Every pass the caller can see, newest first. */
export function HistoryScreen() {
  const { user } = useSession();
  const q = useQuery((t) => api.listOutpasses(t));
  const items = q.data ?? [];
  return (
    <Screen title="History" eyebrow={user?.role === "PARENT" ? "Your child's passes" : "Your passes"} refreshing={q.refreshing} onRefresh={q.refresh}>
      {q.error ? <ErrorNote message={q.error} onRetry={q.refresh} /> : null}
      {q.loading ? <Loading /> : null}
      {!q.loading && items.length === 0 ? <Empty icon="time-outline" title="No passes yet" body="Requests and trips will show up here." /> : null}
      {items.map((o, i) => (
        <FadeIn key={o.id} index={i}>
          <OutpassCard outpass={o} showStudent={user?.role !== "STUDENT"} />
        </FadeIn>
      ))}
    </Screen>
  );
}
