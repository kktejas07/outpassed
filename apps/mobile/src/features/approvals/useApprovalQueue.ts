import { useState } from "react";
import { api } from "../../api/client";
import { useSession } from "../../auth/session";
import { useQuery } from "../../lib/useQuery";

export type QueueTab = "waiting" | "all";

/**
 * Parent: requests waiting on them. Warden: requests waiting on the warden,
 * plus ones still with the parent (which can be overridden with a reason).
 */
export function useApprovalQueue() {
  const { user } = useSession();
  const [tab, setTab] = useState<QueueTab>("waiting");
  const q = useQuery((token) => api.listOutpasses(token, { scope: tab === "waiting" ? "actionable" : "all" }), [tab]);
  const items = q.data ?? [];
  const isWarden = user?.role === "WARDEN" || user?.role === "ADMIN";
  return {
    ...q,
    tab,
    setTab,
    isWarden,
    readyForWarden: isWarden && tab === "waiting" ? items.filter((o) => o.status === "PENDING_WARDEN") : [],
    withParent: isWarden && tab === "waiting" ? items.filter((o) => o.status === "PENDING_PARENT") : [],
    items,
  };
}
