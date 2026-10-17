import { Redirect, Stack } from "expo-router";
import { homeFor } from "../../src/auth/homeFor";
import { useSession } from "../../src/auth/session";
import { color } from "../../src/theme/tokens";

export default function AuthLayout() {
  const { status, user } = useSession();
  if (status === "authenticated") return <Redirect href={homeFor(user?.role)} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.white } }} />;
}
