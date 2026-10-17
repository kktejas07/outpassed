import type { ReactNode } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { Brand } from "../components/Brand";
import { color } from "../theme/tokens";
import { Text } from "./Text";

/**
 * The app is designed for phones. In a wide browser window it runs in a
 * phone-width column, with the brand beside it on large screens. On native
 * and on narrow web screens it renders children unchanged.
 */
export function WebFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  if (Platform.OS !== "web" || width < 640) return <>{children}</>;
  const showSide = width >= 1040;
  return (
    <View style={styles.page}>
      {showSide ? (
        <View style={styles.side}>
          <Brand size={56} />
          <Text variant="title" style={{ textAlign: "center" }}>Outpasses and visitors for your campus</Text>
          <Text variant="caption" style={{ textAlign: "center", maxWidth: 300 }}>
            Built for phones. Get the iOS or Android app for the camera scanner and the smoothest gate pass.
          </Text>
        </View>
      ) : null}
      <View style={styles.column}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "stretch", gap: 72, backgroundColor: color.indigoTint, paddingVertical: 24 },
  side: { width: 320, alignItems: "center", justifyContent: "center", gap: 14 },
  column: {
    width: 430,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: color.ground,
    borderWidth: 1,
    borderColor: color.line,
    shadowColor: "#1E1B4B",
    shadowOpacity: 0.14,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
  },
});
