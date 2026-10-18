import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "../../src/auth/session";
import { color } from "../../src/theme/tokens";

export default function AppLayout() {
  const { status } = useSession();
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.white }}>
        <ActivityIndicator color={color.accent} />
      </View>
    );
  }
  if (status === "unauthenticated") return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.ground } }} />;
}
