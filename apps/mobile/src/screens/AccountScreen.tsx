import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSession } from "../auth/session";
import { color } from "../theme/tokens";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Avatar, KeyValue } from "../ui/bits";
import { FadeIn } from "../ui/motion";
import { Pill } from "../ui/Pill";
import { Screen } from "../ui/Screen";
import { Text } from "../ui/Text";

const roleLabel = { STUDENT: "Student", PARENT: "Parent", WARDEN: "Warden", GUARD: "Security", ADMIN: "Admin" } as const;

export function AccountScreen() {
  const { user, signOut } = useSession();
  if (!user) return null;
  const s = user.student;
  return (
    <Screen title="Me">
      <FadeIn>
        <Card style={styles.profile}>
          <Avatar name={user.name} size={64} tone="accent" />
          <View style={{ alignItems: "center", gap: 6 }}>
            <Text variant="title">{user.name}</Text>
            <Pill label={roleLabel[user.role]} tone="indigo" />
          </View>
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
  note: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, backgroundColor: color.indigoTint },
});
