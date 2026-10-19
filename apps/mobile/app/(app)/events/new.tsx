import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { campus, errorMessage } from "../../../src/api/client";
import { useSession } from "../../../src/auth/session";
import { Button } from "../../../src/ui/Button";
import { Chips, ErrorNote } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn } from "../../../src/ui/motion";
import { useRibbon } from "../../../src/ui/Ribbon";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

const categories = ["Tech", "Cultural", "Sports", "Workshop", "Talk", "Club", "Placement", "General"].map((c) => ({ value: c, label: c }));
const days = [
  { value: "1", label: "Tomorrow" },
  { value: "2", label: "In 2 days" },
  { value: "7", label: "Next week" },
];
const slots = [
  { value: "10", label: "10 AM" },
  { value: "14", label: "2 PM" },
  { value: "17", label: "5 PM" },
];
const lengths = [
  { value: "1", label: "1 hour" },
  { value: "2", label: "2 hours" },
  { value: "4", label: "Half day" },
];

/** Propose an event (admins publish straight away). */
export default function NewEvent() {
  const { token, user } = useSession();
  const ribbon = useRibbon();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [venue, setVenue] = useState("");
  const [category, setCategory] = useState("Tech");
  const [day, setDay] = useState("2");
  const [slot, setSlot] = useState("14");
  const [length, setLength] = useState("2");
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const admin = user?.role === "ADMIN";
  const valid = title.trim().length >= 3 && description.trim() && venue.trim();

  async function submit() {
    if (!token || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const start = new Date();
      start.setDate(start.getDate() + Number(day));
      start.setHours(Number(slot), 0, 0, 0);
      const end = new Date(start.getTime() + Number(length) * 3_600_000);
      const e = await campus.createEvent(token, {
        title: title.trim(),
        description: description.trim(),
        venue: venue.trim(),
        category,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        capacity: capacity ? Number(capacity) : undefined,
      });
      router.replace(`/events/${e.id}`);
      ribbon.show(admin ? { tone: "success", title: "Event published", body: "Every student has been told.", celebrate: true } : { tone: "success", title: "Sent for approval", body: "An admin will review it; you'll get a message." });
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the event"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={admin ? "New event" : "Propose an event"} eyebrow="Events" back footer={<Button label={admin ? "Publish and notify" : "Send for approval"} icon="send" loading={busy} disabled={!valid} onPress={submit} />}>
      <FadeIn style={{ gap: 14 }}>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Hackathon kick-off" />
        <Field label="What's it about?" value={description} onChangeText={setDescription} multiline placeholder="Who it's for, what to bring, prizes…" />
        <Field label="Where" value={venue} onChangeText={setVenue} placeholder="e.g. Seminar Hall 2" />
      </FadeIn>
      <FadeIn index={1} style={{ gap: 10 }}>
        <Text variant="eyebrow">Type</Text>
        <Chips options={categories} value={category} onChange={setCategory} />
        <Text variant="eyebrow">When</Text>
        <Chips options={days} value={day} onChange={setDay} />
        <Chips options={slots} value={slot} onChange={setSlot} />
        <Chips options={lengths} value={length} onChange={setLength} />
      </FadeIn>
      <FadeIn index={2}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Seats (optional)" value={capacity} onChangeText={(v) => setCapacity(v.replace(/\D/g, "").slice(0, 5))} keyboardType="number-pad" placeholder="No limit" />
          </View>
        </View>
      </FadeIn>
      {!admin ? <Text variant="caption">An admin approves student events before everyone is told.</Text> : null}
      {error ? <ErrorNote message={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", gap: 12 } });
