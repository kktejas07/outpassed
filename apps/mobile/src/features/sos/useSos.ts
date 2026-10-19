import type { SosDto, SosKind } from "@outpassed/shared";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useSession } from "../../auth/session";
import { useAction, useQuery } from "../../lib/useQuery";
import { useRibbon } from "../../ui/Ribbon";

export const sosKinds: { value: SosKind; label: string; icon: "medkit" | "shield" | "help-buoy"; hint: string }[] = [
  { value: "MEDICAL", label: "Medical", icon: "medkit", hint: "Injury, fever, fainting, allergy" },
  { value: "SAFETY", label: "Safety", icon: "shield", hint: "Threat, harassment, fire, fight" },
  { value: "OTHER", label: "Other help", icon: "help-buoy", hint: "Locked out, lost, stuck outside" },
];

const STAFF = new Set(["WARDEN", "GUARD", "ADMIN"]);

/** SOS for everyone: raise and track your own, or respond to others if you're staff. Refreshes every 10 s. */
export function useSos() {
  const { user } = useSession();
  const ribbon = useRibbon();
  const staff = STAFF.has(user?.role ?? "");
  const q = useQuery((t) => api.sosList(t));
  useEffect(() => {
    const t = setInterval(() => void q.reload(), 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [kind, setKind] = useState<SosKind>("MEDICAL");
  const [note, setNote] = useState("");
  const raise = useAction((t) => api.raiseSos(t, kind, note.trim() || undefined));
  const ack = useAction((t, id: string) => api.acknowledgeSos(t, id));
  const resolve = useAction((t, id: string, resolution?: string) => api.resolveSos(t, id, resolution));

  const alerts = q.data ?? [];
  const mine = !staff ? alerts.find((a) => a.status !== "RESOLVED") ?? null : null;
  const replace = (a: SosDto) => q.setData([a, ...alerts.filter((x) => x.id !== a.id)]);

  return {
    ...q,
    staff,
    alerts,
    open: alerts.filter((a) => a.status !== "RESOLVED"),
    closed: alerts.filter((a) => a.status === "RESOLVED"),
    mine,
    kind,
    setKind,
    note,
    setNote,
    raising: raise.busy,
    raiseError: raise.error,
    raise: async () => {
      const a = await raise.run();
      if (a) {
        replace(a);
        ribbon.show({ tone: "danger", title: "SOS sent", body: "Wardens and guards have been alerted. Stay where you are if it's safe.", duration: 6000 });
      }
    },
    acting: ack.busy || resolve.busy,
    actError: ack.error ?? resolve.error,
    acknowledge: async (a: SosDto) => {
      const r = await ack.run(a.id);
      if (r) {
        replace(r);
        ribbon.show({ tone: "success", title: "You're responding", body: `${a.raisedBy.name} has been told help is coming.` });
      }
    },
    resolve: async (a: SosDto, resolution?: string) => {
      const r = await resolve.run(a.id, resolution);
      if (r) {
        replace(r);
        ribbon.show({ tone: "success", title: staff ? "Alert closed" : "Alert cancelled" });
      }
    },
  };
}

/** Open alerts for the staff banner. */
export function useOpenSos() {
  const { user } = useSession();
  const staff = STAFF.has(user?.role ?? "");
  const q = useQuery((t) => (staff ? api.sosList(t) : Promise.resolve([] as SosDto[])));
  useEffect(() => {
    if (!staff) return;
    const t = setInterval(() => void q.reload(), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff]);
  return (q.data ?? []).filter((a) => a.status !== "RESOLVED");
}
