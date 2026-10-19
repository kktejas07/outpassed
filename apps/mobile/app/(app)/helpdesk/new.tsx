import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { campus, errorMessage } from "../../../src/api/client";
import { useSession } from "../../../src/auth/session";
import { TICKET_ICON } from "../../../src/features/helpdesk/useHelpdesk";
import { pickPhoto } from "../../../src/features/photo/pickPhoto";
import { color, radius } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Chips, ErrorNote } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn } from "../../../src/ui/motion";
import { useRibbon } from "../../../src/ui/Ribbon";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

const CATEGORIES = ["Water", "Electricity", "Wi-Fi", "Room repair", "Cleaning", "Mess", "Furniture", "Other"];

/** A student reports a hostel problem; the warden gets an alert. */
export default function NewTicket() {
  const { token, user } = useSession();
  const ribbon = useRibbon();
  const [category, setCategory] = useState("Water");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [location, setLocation] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = title.trim().length >= 3 && details.trim().length >= 3;
  const room = user?.student?.room;

  async function submit() {
    if (!token || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const t = await campus.raiseTicket(token, { category, title: title.trim(), details: details.trim(), location: location.trim() || undefined, photo: photo ?? undefined });
      router.replace(`/helpdesk/${t.id}`);
      ribbon.show({ tone: "success", title: `Request #${t.number} sent`, body: "The warden has been told. You'll get updates here and on WhatsApp." });
    } catch (err) {
      setError(errorMessage(err, "Couldn't send your request"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Report a problem" eyebrow="Helpdesk" back footer={<Button icon="send" label="Send to warden" loading={busy} disabled={!valid} onPress={submit} />}>
      <FadeIn style={{ gap: 10 }}>
        <Text variant="eyebrow">What's it about?</Text>
        <Chips options={CATEGORIES.map((c) => ({ value: c, label: c, icon: TICKET_ICON[c] }))} value={category} onChange={setCategory} />
      </FadeIn>
      <FadeIn index={1} style={{ gap: 14 }}>
        <Field label="In a few words" value={title} onChangeText={setTitle} placeholder="e.g. No water on the 2nd floor" />
        <Field label="Details" value={details} onChangeText={setDetails} multiline placeholder="Since when, how bad, anything you've tried" />
        <Field label="Where" value={location} onChangeText={setLocation} placeholder={room ? `Room ${room} (leave empty for your room)` : "e.g. 2nd floor washroom"} />
      </FadeIn>
      <FadeIn index={2}>
        <Pressable onPress={async () => { const p = await pickPhoto("camera", "back").catch(() => null); if (p) setPhoto(p); }} accessibilityRole="button" accessibilityLabel="Add a photo" style={styles.photo}>
          {photo ? (
            <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={{ alignItems: "center", gap: 6 }}>
              <Ionicons name="camera-outline" size={26} color={color.indigo} />
              <Text variant="label" style={{ color: color.indigo }}>Add a photo (optional)</Text>
              <Text variant="caption">A picture helps the warden send the right person</Text>
            </View>
          )}
        </Pressable>
      </FadeIn>
      {error ? <ErrorNote message={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { height: 150, borderRadius: radius.lg, borderWidth: 2, borderStyle: "dashed", borderColor: color.headSub, backgroundColor: color.indigoTint, alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
