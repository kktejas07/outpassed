import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from "@expo-google-fonts/manrope";
import { Sora_600SemiBold, Sora_700Bold } from "@expo-google-fonts/sora";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../src/auth/session";
import { color } from "../src/theme/tokens";

export default function RootLayout() {
  const [loaded, failed] = useFonts({ Sora_600SemiBold, Sora_700Bold, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });
  // Fall back to system fonts rather than block the app if fonts fail to load.
  if (!loaded && !failed) return <View style={{ flex: 1, backgroundColor: color.white }} />;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.ground } }} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
