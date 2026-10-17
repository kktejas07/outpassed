import type { OutpassType } from "@outpassed/shared";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { useAction } from "../../lib/useQuery";

export type LeavePreset = "now" | "1h" | "evening" | "tomorrow";
export type DurationPreset = "3h" | "6h" | "tonight" | "2d" | "4d" | "7d";

export const leavePresets: { value: LeavePreset; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "1h", label: "In 1 hour" },
  { value: "evening", label: "This evening" },
  { value: "tomorrow", label: "Tomorrow 8 AM" },
];

export const durationPresets: { value: DurationPreset; label: string }[] = [
  { value: "3h", label: "3 hours" },
  { value: "6h", label: "6 hours" },
  { value: "tonight", label: "Back by 9 PM" },
  { value: "2d", label: "2 days" },
  { value: "4d", label: "4 days" },
  { value: "7d", label: "A week" },
];

function leaveDate(p: LeavePreset, now: Date): Date {
  const d = new Date(now);
  if (p === "now") return d;
  if (p === "1h") return new Date(now.getTime() + 3_600_000);
  if (p === "evening") {
    d.setHours(17, 0, 0, 0);
    return d > now ? d : new Date(now.getTime() + 3_600_000);
  }
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d;
}

function returnDate(p: DurationPreset, leave: Date): Date {
  const h = (n: number) => new Date(leave.getTime() + n * 3_600_000);
  switch (p) {
    case "3h": return h(3);
    case "6h": return h(6);
    case "2d": return h(48);
    case "4d": return h(96);
    case "7d": return h(168);
    case "tonight": {
      const d = new Date(leave);
      d.setHours(21, 0, 0, 0);
      return d > leave ? d : h(3);
    }
  }
}

/** New outpass form: presets instead of date pickers, validated before submit. */
export function useNewOutpass() {
  const [type, setTypeState] = useState<OutpassType>("LOCAL");
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [leave, setLeave] = useState<LeavePreset>("now");
  const [duration, setDuration] = useState<DurationPreset>("3h");
  const [touched, setTouched] = useState(false);

  const setType = (t: OutpassType) => {
    setTypeState(t);
    // Sensible default length per type.
    setDuration(t === "HOME" ? "2d" : t === "MEDICAL" ? "6h" : "3h");
  };

  const times = useMemo(() => {
    const leaveAt = leaveDate(leave, new Date());
    return { leaveAt, returnBy: returnDate(duration, leaveAt) };
  }, [leave, duration]);

  const errors = {
    destination: destination.trim().length < 2 ? "Where are you going?" : null,
    reason: reason.trim().length < 3 ? "Add a short reason" : null,
  };
  const valid = !errors.destination && !errors.reason;

  const action = useAction((token) =>
    api.createOutpass(token, {
      type,
      destination: destination.trim(),
      reason: reason.trim(),
      leaveAt: times.leaveAt.toISOString(),
      returnBy: times.returnBy.toISOString(),
    }),
  );

  async function submit() {
    setTouched(true);
    if (!valid) return;
    const created = await action.run();
    if (created) router.replace(`/outpass/${created.id}`);
  }

  return {
    type, setType,
    destination, setDestination,
    reason, setReason,
    leave, setLeave,
    duration, setDuration,
    times,
    errors: touched ? errors : { destination: null, reason: null },
    submit,
    submitting: action.busy,
    submitError: action.error,
  };
}
