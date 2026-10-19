import type { NotificationDto } from "@outpassed/shared";
import { useEffect } from "react";
import { api } from "../../api/client";
import { useSession } from "../../auth/session";
import { useQuery } from "../../lib/useQuery";

/** The signed-in user's alerts, newest first. */
export function useInbox() {
  const { token } = useSession();
  const q = useQuery((t) => api.notifications(t));
  const list = q.data?.notifications ?? [];
  return {
    ...q,
    items: list,
    unread: q.data?.unread ?? 0,
    markAllRead: async () => {
      if (!token || !q.data?.unread) return;
      await api.markRead(token).catch(() => undefined);
      q.setData({ unread: 0, notifications: list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) });
    },
    markRead: async (n: NotificationDto) => {
      if (!token || n.readAt) return;
      await api.markRead(token, [n.id]).catch(() => undefined);
      q.setData({ unread: Math.max(0, (q.data?.unread ?? 1) - 1), notifications: list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) });
    },
  };
}

/** Unread count for the bell, refreshed every 30 s while the screen is open. */
export function useUnreadCount() {
  const q = useQuery((t) => api.notifications(t).then((r) => r.unread));
  useEffect(() => {
    const t = setInterval(() => void q.reload(), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return q.data ?? 0;
}
