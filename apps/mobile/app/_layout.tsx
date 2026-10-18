import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from "@expo-google-fonts/manrope";
import { Sora_600SemiBold, Sora_700Bold } from "@expo-google-fonts/sora";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../src/auth/session";
import { listenForTaps } from "../src/notifications/push";
import { color } from "../src/theme/tokens";
import { WebFrame } from "../src/ui/WebFrame";
import { RibbonProvider } from "../src/ui/Ribbon";
import { AlertWatcher } from "../src/notifications/AlertWatcher";

export default function RootLayout() {
  // Tapping a phone alert opens the pass or visit it's about.
  useEffect(() => listenForTaps(), []);
  const [loaded, failed] = useFonts({ Sora_600SemiBold, Sora_700Bold, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });
  // Fall back to system fonts rather than block the app if fonts fail to load.
  if (!loaded && !failed) return <View style={{ flex: 1, backgroundColor: color.white }} />;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <WebFrame>
          <RibbonProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.ground } }} />
            <AlertWatcher />
          </RibbonProvider>
        </WebFrame>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
