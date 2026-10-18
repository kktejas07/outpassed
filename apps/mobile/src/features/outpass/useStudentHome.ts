import { api } from "../../api/client";
import { isActive } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";

/** Student home: the active pass, past passes, and counts for parcels and notices. */
export function useStudentHome() {
  const q = useQuery(async (token) => {
    const [outpasses, parcels, notices] = await Promise.all([
      api.listOutpasses(token),
      api.parcels(token, "waiting").catch(() => []),
      api.notices(token).catch(() => ({ notices: [], unread: 0 })),
    ]);
    return { outpasses, parcels, notices };
  });
  const all = q.data?.outpasses ?? [];
  const active = all.find((o) => isActive(o.status)) ?? null;
  const history = all.filter((o) => o !== active);
  const latestNotice = q.data?.notices.notices.find((n) => !n.read) ?? null;
  return {
    ...q,
    active,
    history,
    canRequest: !active,
    parcelsWaiting: q.data?.parcels.length ?? 0,
    unreadNotices: q.data?.notices.unread ?? 0,
    latestNotice,
  };
}
