import { api } from "../../api/client";
import { isActive } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";

/** Student home: the one active pass (if any) and past passes. */
export function useStudentHome() {
  const q = useQuery((token) => api.listOutpasses(token));
  const all = q.data ?? [];
  const active = all.find((o) => isActive(o.status)) ?? null;
  const history = all.filter((o) => o !== active);
  return { ...q, active, history, canRequest: !active };
}
