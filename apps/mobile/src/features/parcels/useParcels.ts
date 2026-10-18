import type { ParcelDto } from "@outpassed/shared";
import { useState } from "react";
import { api } from "../../api/client";
import { useAction, useQuery } from "../../lib/useQuery";
import { useRibbon } from "../../ui/Ribbon";

/** Student: their parcels, waiting ones first with the collection code. */
export function useMyParcels() {
  const q = useQuery((t) => api.parcels(t, "recent"));
  const all = q.data ?? [];
  return { ...q, waiting: all.filter((p) => p.status === "AT_GATE"), done: all.filter((p) => p.status !== "AT_GATE") };
}

export const carriers = ["Amazon", "Flipkart", "Swiggy", "Zomato", "Blinkit", "Myntra", "Courier", "Other"] as const;

/** Guard: log new parcels and hand over waiting ones against the student's code. */
export function useGateParcels() {
  const ribbon = useRibbon();
  const q = useQuery((t) => api.parcels(t, "waiting"));
  const [rollNo, setRollNo] = useState("");
  const [carrier, setCarrier] = useState<(typeof carriers)[number]>("Amazon");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const log = useAction((t) => api.logParcel(t, { rollNo: rollNo.trim(), carrier, note: note.trim() || undefined }));
  const collect = useAction((t, id: string, code: string) => api.collectParcel(t, id, code));

  const list = (q.data ?? []).filter((p) => {
    const s = search.trim().toLowerCase();
    return !s || p.student.name.toLowerCase().includes(s) || (p.student.rollNo ?? "").toLowerCase().includes(s);
  });

  return {
    ...q,
    list,
    search,
    setSearch,
    rollNo,
    setRollNo,
    carrier,
    setCarrier,
    note,
    setNote,
    logging: log.busy,
    logError: log.error,
    logParcel: async () => {
      if (!rollNo.trim()) return;
      const p = await log.run();
      if (p) {
        ribbon.show({ tone: "success", title: `Logged for ${p.student.name}`, body: `${p.carrier} parcel. They've been sent a collection code.` });
        setRollNo("");
        setNote("");
        void q.reload();
      }
    },
    collecting: collect.busy,
    collectError: collect.error,
    clearCollectError: () => collect.setError(null),
    handOver: async (p: ParcelDto, code: string) => {
      const done = await collect.run(p.id, code);
      if (done) {
        ribbon.show({ tone: "success", title: "Handed over", body: `${p.carrier} parcel to ${p.student.name}.`, celebrate: true });
        void q.reload();
      }
      return !!done;
    },
  };
}
