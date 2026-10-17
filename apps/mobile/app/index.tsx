import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { homeFor } from "../src/auth/homeFor";
import { useSession } from "../src/auth/session";
import { color } from "../src/theme/tokens";

export default function Index() {
  const { status, user } = useSession();
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.white }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }
  return <Redirect href={status === "authenticated" ? homeFor(user?.role) : "/login"} />;
}
