import type { Decision, VisitorType } from "@outpassed/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useSession } from "../../auth/session";
import { useAction, useQuery } from "../../lib/useQuery";
import { useRibbon } from "../../ui/Ribbon";

export type VisitTab = "pending" | "onsite" | "all";

export function useVisitList(initial: VisitTab = "all") {
  const [tab, setTab] = useState<VisitTab>(initial);
  const q = useQuery((t) => api.listVisits(t, tab), [tab]);
  const decide = useAction((t, id: string, d: Decision) => api.decideVisit(t, id, d));
  const ribbon = useRibbon();
  return {
    ...q,
    tab,
    setTab,
    visits: q.data ?? [],
    decide: async (id: string, d: Decision) => {
      const res = await decide.run(id, d);
      if (res) {
        void q.reload();
        ribbon.show(d === "APPROVE" ? { tone: "success", title: `${res.visitorName} can come in`, body: "The gate has been told." } : { tone: "info", title: `${res.visitorName} declined` });
      }
    },
    deciding: decide.busy,
    decideError: decide.error,
  };
}

/** Shared state for the visitor form (host invite and guard walk-in). */
function useVisitorFields() {
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorType, setVisitorType] = useState<VisitorType>("GUEST");
  const [purpose, setPurpose] = useState("");
  const errors = {
    visitorName: visitorName.trim() ? null : "Visitor's name",
    visitorPhone: visitorPhone.replace(/\D/g, "").length >= 5 ? null : "A phone number",
    purpose: purpose.trim() ? null : "Purpose of visit",
  };
  return { visitorName, setVisitorName, visitorPhone, setVisitorPhone, visitorType, setVisitorType, purpose, setPurpose, errors };
}

export const visitWindows = [
  { value: "2h", label: "Next 2 hours", from: 0, hours: 2 },
  { value: "today", label: "Rest of today", from: 0, hours: -1 },
  { value: "tomorrow", label: "Tomorrow", from: 24, hours: 10 },
  { value: "regular", label: "Regular visitor", from: 0, hours: 0 },
] as const;

/** Daily hours for a regular pass. */
export const regularHours = [
  { value: "10:00-13:00", label: "10 AM – 1 PM" },
  { value: "10:00-18:00", label: "10 AM – 6 PM" },
  { value: "16:00-20:00", label: "4 PM – 8 PM" },
] as const;
export const regularSpans = [
  { value: "30", label: "1 month" },
  { value: "90", label: "3 months" },
  { value: "180", label: "6 months" },
] as const;
export const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export type VisitWindow = (typeof visitWindows)[number]["value"];

/** A host invites a visitor; returns the pass to share. */
export function useInviteVisitor() {
  const f = useVisitorFields();
  const [window, setWindow] = useState<VisitWindow>("2h");
  // Regular pass: Sundays 10–6 for 3 months by default (the typical parent visit).
  const [days, setDays] = useState<number[]>([0]);
  const [dailyHours, setDailyHours] = useState<(typeof regularHours)[number]["value"]>("10:00-18:00");
  const [span, setSpan] = useState<(typeof regularSpans)[number]["value"]>("90");
  const ribbon = useRibbon();
  const [touched, setTouched] = useState(false);
  const action = useAction(async (t) => {
    const now = new Date();
    let validFrom = now;
    let validTo: Date;
    if (window === "regular") {
      const [from, to] = dailyHours.split("-") as [string, string];
      return api.createVisit(t, {
        visitorName: f.visitorName.trim(),
        visitorPhone: f.visitorPhone.trim(),
        visitorType: f.visitorType,
        purpose: f.purpose.trim(),
        validFrom: now.toISOString(),
        validTo: new Date(now.getTime() + Number(span) * 86_400_000).toISOString(),
        repeat: { days, from, to },
      });
    }
    if (window === "2h") validTo = new Date(now.getTime() + 2 * 3_600_000);
    else if (window === "today") {
      validTo = new Date(now);
      validTo.setHours(23, 0, 0, 0);
      if (validTo <= now) validTo = new Date(now.getTime() + 2 * 3_600_000);
    } else {
      validFrom = new Date(now);
      validFrom.setDate(now.getDate() + 1);
      validFrom.setHours(8, 0, 0, 0);
      validTo = new Date(validFrom.getTime() + 10 * 3_600_000);
    }
    return api.createVisit(t, {
      visitorName: f.visitorName.trim(),
      visitorPhone: f.visitorPhone.trim(),
      visitorType: f.visitorType,
      purpose: f.purpose.trim(),
      validFrom: validFrom.toISOString(),
      validTo: validTo.toISOString(),
    });
  });
  const valid = !Object.values(f.errors).some(Boolean) && (window !== "regular" || days.length > 0);
  return {
    ...f,
    errors: touched ? f.errors : { visitorName: null, visitorPhone: null, purpose: null },
    window,
    setWindow: (w: VisitWindow) => {
      setWindow(w);
      if (w === "regular" && f.visitorType === "GUEST") f.setVisitorType("PARENT");
    },
    days,
    toggleDay: (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort())),
    dailyHours,
    setDailyHours,
    span,
    setSpan,
    submit: async () => {
      setTouched(true);
      if (!valid) return;
      const v = await action.run();
      if (v) {
        router.replace(`/visit/${v.id}`);
        ribbon.show({ tone: "success", title: "Visitor pass ready", body: `Share it with ${v.visitorName.split(" ")[0]}. Entry code ${v.code}.`, celebrate: true });
      }
    },
    submitting: action.busy,
    submitError: action.error,
  };
}

/** Guard registers someone at the gate who has no invite; the host approves. */
export function useWalkIn() {
  const { token } = useSession();
  const f = useVisitorFields();
  const [hostQuery, setHostQuery] = useState("");
  const [hosts, setHosts] = useState<{ id: string; name: string; role: string; detail: string | null }[]>([]);
  const [host, setHost] = useState<{ id: string; name: string; detail?: string | null } | null>(null);
  const [idNumber, setIdNumber] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const ribbon = useRibbon();

  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => {
      api.hosts(token, hostQuery.trim() || undefined).then(setHosts).catch(() => setHosts([]));
    }, 250);
    return () => clearTimeout(t);
  }, [token, hostQuery]);

  const action = useAction((t, hostId: string) =>
    api.walkIn(t, {
      visitorName: f.visitorName.trim(),
      visitorPhone: f.visitorPhone.trim(),
      visitorType: f.visitorType,
      purpose: f.purpose.trim(),
      hostId,
      visitorIdNumber: idNumber.trim() || undefined,
      photo: photo ?? undefined,
      durationMinutes: 180,
    }),
  );

  const errors = { ...f.errors, host: host ? null : "Who are they here to meet?" };
  const valid = !Object.values(errors).some(Boolean);

  return {
    ...f,
    errors: touched ? errors : { visitorName: null, visitorPhone: null, purpose: null, host: null },
    hostQuery,
    setHostQuery,
    hosts,
    host,
    setHost,
    idNumber,
    setIdNumber,
    photo,
    setPhoto,
    created,
    submit: async () => {
      setTouched(true);
      if (!valid || !host) return;
      const v = await action.run(host.id);
      if (v) {
        setCreated(`${v.visitorName} is waiting for ${host.name} to approve.`);
        ribbon.show({ tone: "success", title: "Sent to host", body: `${host.name} will get an alert with the visitor's photo.` });
      }
    },
    reset: () => {
      f.setVisitorName("");
      f.setVisitorPhone("");
      f.setPurpose("");
      setHost(null);
      setHostQuery("");
      setIdNumber("");
      setPhoto(null);
      setTouched(false);
      setCreated(null);
    },
    submitting: action.busy,
    submitError: action.error,
  };
}

export function useVisitDetail(id: string) {
  const q = useQuery(async (t) => {
    const visit = await api.getVisit(t, id);
    const qr = visit && (visit.status === "APPROVED" || visit.status === "CHECKED_IN") ? await api.visitQr(t, id) : null;
    return { visit, qr };
  }, [id]);
  return { ...q, visit: q.data?.visit ?? null, qr: q.data?.qr ?? null };
}
