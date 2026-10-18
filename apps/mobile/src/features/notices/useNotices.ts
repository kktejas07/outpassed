import type { NoticeAudience, NoticeDto } from "@outpassed/shared";
import { useState } from "react";
import { api } from "../../api/client";
import { useSession } from "../../auth/session";
import { useAction, useQuery } from "../../lib/useQuery";
import { useRibbon } from "../../ui/Ribbon";

export const audiences: { value: NoticeAudience; label: string }[] = [
  { value: "STUDENTS", label: "Students" },
  { value: "PARENTS", label: "Parents" },
  { value: "EVERYONE", label: "Everyone" },
];

/** Notice board: read for everyone, post and see read receipts for wardens and admins. */
export function useNotices() {
  const { token, user } = useSession();
  const ribbon = useRibbon();
  const canPost = user?.role === "WARDEN" || user?.role === "ADMIN";
  const q = useQuery((t) => api.notices(t));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<NoticeAudience>("STUDENTS");
  const [pinned, setPinned] = useState(false);
  const post = useAction((t) => api.postNotice(t, { title: title.trim(), body: body.trim(), audience, pinned }));
  const list = q.data?.notices ?? [];

  return {
    ...q,
    list,
    unread: q.data?.unread ?? 0,
    canPost,
    title, setTitle, body, setBody, audience, setAudience, pinned, setPinned,
    posting: post.busy,
    postError: post.error,
    valid: title.trim().length >= 3 && body.trim().length > 0,
    post: async () => {
      const r = await post.run();
      if (r) {
        ribbon.show({ tone: "success", title: "Notice posted", body: `${audiences.find((a) => a.value === audience)?.label} have been alerted.`, celebrate: true });
        setTitle(""); setBody(""); setPinned(false);
        void q.reload();
        return true;
      }
      return false;
    },
    markRead: async (n: NoticeDto) => {
      if (n.read || canPost || !token) return;
      await api.readNotice(token, n.id).catch(() => undefined);
      q.setData({ unread: Math.max(0, (q.data?.unread ?? 1) - 1), notices: list.map((x) => (x.id === n.id ? { ...x, read: true } : x)) });
    },
    remove: async (n: NoticeDto) => {
      if (!token) return;
      await api.deleteNotice(token, n.id).catch(() => undefined);
      ribbon.show({ tone: "info", title: "Notice removed" });
      void q.reload();
    },
  };
}
