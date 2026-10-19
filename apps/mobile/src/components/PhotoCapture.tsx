import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Image, Platform, Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../api/client";
import { pickPhoto } from "../features/photo/pickPhoto";
import { color, font, radius } from "../theme/tokens";
import { PopIn } from "../ui/motion";
import { Text } from "../ui/Text";

/**
 * The guard's camera box: tap to photograph the person in front of them.
 * Phones use the camera; the web build picks a file.
 */
export function PhotoCapture({ value, onChange, label = "Photo of the person", hint }: { value: string | null; onChange: (b64: string | null) => void; label?: string; hint?: string }) {
  const [error, setError] = useState<string | null>(null);
  async function take() {
    setError(null);
    try {
      const p = await pickPhoto(Platform.OS === "web" ? "library" : "camera");
      if (p) onChange(p);
    } catch (err) {
      setError(errorMessage(err, "Couldn't open the camera"));
    }
  }
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      {value ? (
        <PopIn style={styles.row}>
          <Image source={{ uri: `data:image/jpeg;base64,${value}` }} style={styles.thumb} accessibilityLabel="Photo taken" />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.ok}>
              <Ionicons name="checkmark-circle" size={16} color={color.green} />
              <Text style={styles.okText}>Photo taken</Text>
            </View>
            <Pressable onPress={() => void take()} accessibilityRole="button" hitSlop={8}>
              <Text variant="label" style={{ color: color.indigo }}>Retake</Text>
            </Pressable>
          </View>
        </PopIn>
      ) : (
        <Pressable onPress={() => void take()} accessibilityRole="button" accessibilityLabel="Take photo" style={({ pressed }) => [styles.box, pressed && { opacity: 0.75 }]}>
          <View style={styles.cam}><Ionicons name="camera" size={24} color={color.white} /></View>
          <View style={{ flex: 1 }}>
            <Text variant="label" style={{ color: color.indigoDeep }}>Take photo</Text>
            <Text variant="caption">{hint ?? "Kept with this gate entry for the record."}</Text>
          </View>
        </Pressable>
      )}
      {error ? <Text variant="caption" style={{ color: color.red }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 2, borderStyle: "dashed", borderColor: color.headSub, backgroundColor: color.indigoTint },
  cam: { width: 46, height: 46, borderRadius: 23, backgroundColor: color.indigo, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: radius.md, backgroundColor: color.greenSoft },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: color.field },
  ok: { flexDirection: "row", alignItems: "center", gap: 6 },
  okText: { fontFamily: font.bodyBold, fontSize: 13, color: color.green },
});
