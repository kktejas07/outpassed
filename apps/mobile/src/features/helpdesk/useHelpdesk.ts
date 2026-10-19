import type Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { campus, type TicketStatus } from "../../api/client";
import { useAction, useQuery } from "../../lib/useQuery";
import { useRibbon } from "../../ui/Ribbon";

export type TicketTab = "ACTIVE" | "ALL";

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: "amber" | "indigo" | "green" | "neutral" }> = {
  OPEN: { label: "Open", tone: "amber" },
  IN_PROGRESS: { label: "Being fixed", tone: "indigo" },
  RESOLVED: { label: "Fixed", tone: "green" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export function useTicketList() {
  const [tab, setTab] = useState<TicketTab>("ACTIVE");
  const q = useQuery((t) => campus.tickets(t, tab), [tab]);
  return { ...q, tab, setTab, tickets: q.data?.tickets ?? [], counts: q.data?.counts };
}

export function useTicket(id: string) {
  const q = useQuery((t) => campus.ticket(t, id), [id]);
  const ribbon = useRibbon();
  const act = useAction((t, body: string, status?: TicketStatus) => campus.updateTicket(t, id, { body: body || undefined, status }));
  return {
    ...q,
    ticket: q.data,
    update: async (body: string, status?: TicketStatus, done?: string) => {
      const r = await act.run(body, status);
      if (r) {
        void q.reload();
        if (done) ribbon.show({ tone: "success", title: done });
      }
      return !!r;
    },
    busy: act.busy,
    actionError: act.error,
  };
}

/** Icon for each helpdesk category. */
export const TICKET_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Water: "water",
  Electricity: "flash",
  "Wi-Fi": "wifi",
  "Room repair": "hammer",
  Cleaning: "sparkles",
  Mess: "restaurant",
  Furniture: "bed",
  Other: "help-circle",
};
