import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { api, errorMessage } from "../api/client";
import { ConsentSettings } from "../components/ConsentCard";
import { pickPhoto } from "../features/photo/pickPhoto";
import { useRibbon } from "../ui/Ribbon";
import { useSession } from "../auth/session";
import { color } from "../theme/tokens";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Avatar, ErrorNote, KeyValue } from "../ui/bits";
import { FadeIn } from "../ui/motion";
import { Pill } from "../ui/Pill";
import { Screen } from "../ui/Screen";
import { Text } from "../ui/Text";

const roleLabel = { STUDENT: "Student", PARENT: "Parent", WARDEN: "Warden", GUARD: "Security", ADMIN: "Admin", FACULTY: "Faculty" } as const;

export function AccountScreen() {
  const { user, token, signOut, refresh } = useSession();
  const ribbon = useRibbon();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const s = user.student;
  // Guards compare this photo at the gate, so students are asked for one.
  const wantsPhoto = user.role === "STUDENT";
  // Under 18: no photos until a parent agrees in their app.
  const waitingForParent = user.photoConsent === "NEEDED";

  async function changePhoto(source: "camera" | "library") {
    if (!token) return;
    setError(null);
    try {
      const image = await pickPhoto(source);
      if (!image) return;
      setBusy(true);
      await api.uploadMyPhoto(token, image);
      await refresh();
      ribbon.show({ tone: "success", title: "Photo saved", body: wantsPhoto ? "Guards will see it when you scan out." : undefined });
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the photo"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Me">
      <FadeIn>
        <Card style={styles.profile}>
          <Avatar name={user.name} size={96} tone="accent" photoUrl={user.photoUrl} />
          <View style={{ alignItems: "center", gap: 6 }}>
            <Text variant="title">{user.name}</Text>
            <Pill label={roleLabel[user.role]} tone="indigo" />
          </View>
          {waitingForParent ? (
            <View style={styles.note}>
              <Ionicons name="shield-checkmark-outline" size={18} color={color.indigo} />
              <Text variant="caption" style={{ flex: 1, color: color.ink }}>
                Because you're under 18, your parent needs to allow photos first. Ask them to open Outpass; until then the guard checks your college ID.
              </Text>
            </View>
          ) : wantsPhoto && !user.photoUrl ? (
            <Text variant="caption" style={{ textAlign: "center" }}>
              Add a clear photo of your face. The guard checks it against you at the gate.
            </Text>
          ) : null}
          {waitingForParent ? null : <View style={styles.photoRow}>
            <Button compact tone="outline" icon="camera-outline" label="Take photo" loading={busy} onPress={() => changePhoto("camera")} style={{ flex: 1 }} />
            <Button
              compact
              tone={user.photoUrl ? "outline" : "accent"}
              icon="image-outline"
              label={user.photoUrl ? "Change photo" : "Add photo"}
              loading={busy}
              onPress={() => changePhoto("library")}
              style={{ flex: 1 }}
            />
          </View>}
          {error ? <ErrorNote message={error} /> : null}
        </Card>
      </FadeIn>
      <FadeIn index={1}>
        <Card style={{ paddingVertical: 6 }}>
          <KeyValue label="Email" value={user.email} />
          {user.phone ? <KeyValue label="Phone" value={user.phone} /> : null}
          {s?.rollNo ? <KeyValue label="Roll number" value={s.rollNo} /> : null}
          {s?.hostel ? <KeyValue label="Hostel" value={[s.hostel, s.room ? `Room ${s.room}` : null].filter(Boolean).join(" · ")} /> : null}
        </Card>
      </FadeIn>
      {user.role === "PARENT" ? (
        <FadeIn index={2}>
          <ConsentSettings />
        </FadeIn>
      ) : null}
      {user.role === "PARENT" ? (
        <FadeIn index={2}>
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={18} color={color.indigo} />
            <Text variant="caption" style={{ flex: 1, color: color.ink }}>
              Your college links your account to your child. Ask the hostel office if a request doesn't show up.
            </Text>
          </View>
        </FadeIn>
      ) : null}
      <FadeIn index={3}>
        <Button
          tone="outline"
          icon="log-out-outline"
          label="Sign out"
          onPress={async () => {
            await signOut();
            router.replace("/login");
          }}
        />
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: "center", gap: 12, paddingVertical: 24 },
  photoRow: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  note: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, backgroundColor: color.indigoTint },
});
