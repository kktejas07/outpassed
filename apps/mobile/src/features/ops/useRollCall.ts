import { useState } from "react";
import { ops, type RollSheet } from "../../api/client";
import { useAction, useQuery } from "../../lib/useQuery";
import { useRibbon } from "../../ui/Ribbon";

export type RollFilter = "all" | "unmarked" | "absent" | "onPass";

/** Tonight's roll call for one hostel. */
export function useRollCall() {
  const [hostelId, setHostelId] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<RollFilter>("all");
  const q = useQuery((t) => ops.rollCall(t, hostelId), [hostelId]);
  const ribbon = useRibbon();
  const sheet = q.data;
  const merge = (next: Omit<RollSheet, "hostel" | "hostels"> | undefined) => {
    if (next && sheet) q.setData({ ...sheet, ...next });
    return next;
  };
  const mark = useAction((t, studentId: string, status: "PRESENT" | "ABSENT") => ops.mark(t, sheet!.hostel.id, studentId, status));
  const rest = useAction((t) => ops.markRest(t, sheet!.hostel.id));
  const close = useAction((t) => ops.closeRollCall(t, sheet!.hostel.id));

  const students = (sheet?.students ?? []).filter((s) =>
    filter === "all" ? true : filter === "unmarked" ? s.status === null : filter === "absent" ? s.status === "ABSENT" : s.status === "ON_PASS",
  );

  return {
    ...q,
    sheet,
    students,
    filter,
    setFilter,
    setHostelId,
    closed: !!sheet?.rollCall?.closedAt,
    busy: rest.busy || close.busy,
    actionError: mark.error ?? rest.error ?? close.error,
    /** Tap cycles: unmarked → present → absent → present. */
    toggle: async (s: RollSheet["students"][number]) => {
      if (s.status === "ON_PASS") return;
      // Show the change at once; the server's answer replaces it.
      const next = s.status === "PRESENT" ? "ABSENT" : "PRESENT";
      if (sheet) q.setData({ ...sheet, students: sheet.students.map((x) => (x.id === s.id ? { ...x, status: next } : x)) });
      merge(await mark.run(s.id, next));
    },
    markRest: async () => {
      const r = merge(await rest.run());
      if (r) ribbon.show({ tone: "success", title: "Everyone else marked present" });
    },
    close: async () => {
      const r = merge(await close.run());
      if (r) {
        ribbon.show(
          r.counts.absent
            ? { tone: "warning", title: `${r.counts.absent} absent`, body: "Their parents have been told on WhatsApp and in the app." }
            : { tone: "success", title: "Everyone's accounted for", body: `${r.counts.present} present · ${r.counts.onPass} out on a pass.`, celebrate: true },
        );
      }
    },
  };
}
