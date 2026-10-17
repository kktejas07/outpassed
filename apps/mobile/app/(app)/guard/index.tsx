import Ionicons from "@expo/vector-icons/Ionicons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useGateDesk } from "../../../src/features/gate/useGateDesk";
import { color, font, radius } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Avatar, Segmented } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn, PopIn } from "../../../src/ui/motion";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

function ScanLine() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[styles.scanLine, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 236] }) }] }]} />;
}

export default function GuardScan() {
  const desk = useGateDesk();
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manual, setManual] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const s = desk.state;
  const scanning = s.phase === "idle";

  const verdict = s.phase === "verdict" || s.phase === "saving" || s.phase === "done" ? s.verdict : null;
  const allowed = verdict?.allowed;

  return (
    <Screen title="Main Gate" eyebrow="Security desk">
      {desk.pending.length > 0 ? (
        <View style={styles.queue}>
          <Ionicons name="cloud-upload-outline" size={18} color={color.amber} />
          <Text variant="label" style={{ flex: 1, color: color.amber }}>
            {desk.pending.length} movement{desk.pending.length > 1 ? "s" : ""} waiting to sync
          </Text>
          <Button compact tone="outline" label="Sync" onPress={() => void desk.syncNow()} />
        </View>
      ) : null}

      {scanning || s.phase === "checking" ? (
        <>
          <Segmented
            options={[
              { value: "camera", label: "Scan QR" },
              { value: "manual", label: "Roll number" },
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === "camera" ? (
            <FadeIn>
              <View style={styles.viewfinder}>
                {permission?.granted ? (
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={scanning ? ({ data }) => void desk.check({ qr: data }) : undefined}
                  />
                ) : (
                  <View style={styles.noCam}>
                    <Ionicons name="camera-outline" size={34} color={color.goldLight} />
                    <Text variant="label" style={{ color: color.white, textAlign: "center" }}>Camera access is needed to scan passes</Text>
                    <Button compact label="Allow camera" onPress={() => void requestPermission()} />
                  </View>
                )}
                <View style={styles.corners} pointerEvents="none">
                  <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 }]} />
                  <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 }]} />
                  <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 }]} />
                  <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 }]} />
                  {permission?.granted && scanning ? <ScanLine /> : null}
                </View>
              </View>
              <Text variant="caption" style={{ textAlign: "center", marginTop: 10 }}>
                {s.phase === "checking" ? "Checking pass…" : "Point at the student's or visitor's QR code"}
              </Text>
            </FadeIn>
          ) : (
            <FadeIn style={{ gap: 12 }}>
              <Field
                label="Roll number or pass code"
                placeholder="e.g. 21CS104"
                autoCapitalize="characters"
                value={manual}
                onChangeText={setManual}
                hint="For a student without their phone. Check their college ID."
              />
              <Button
                label="Look up"
                icon="search"
                loading={s.phase === "checking"}
                disabled={!manual.trim()}
                onPress={() => void desk.check(manual.trim().startsWith("v1.") ? { qr: manual.trim() } : { rollNo: manual })}
              />
            </FadeIn>
          )}
        </>
      ) : null}

      {s.phase === "error" ? (
        <PopIn style={[styles.verdict, { borderColor: "#F3C7C7" }]}>
          <View style={[styles.badge, { backgroundColor: color.redSoft }]}>
            <Ionicons name="cloud-offline-outline" size={30} color={color.red} />
          </View>
          <Text variant="title">Couldn't check</Text>
          <Text variant="caption" style={{ textAlign: "center" }}>{s.message}</Text>
          <Button style={{ alignSelf: "stretch" }} tone="outline" label="Try again" onPress={desk.reset} />
        </PopIn>
      ) : null}

      {verdict ? (
        <PopIn style={[styles.verdict, { borderColor: allowed ? "#BBE5C8" : "#F3C7C7" }]}>
          <View style={[styles.badge, { backgroundColor: allowed ? color.greenSoft : color.redSoft }]}>
            <Ionicons name={allowed ? "checkmark-circle" : "close-circle"} size={40} color={allowed ? color.greenBright : color.red} />
          </View>
          <Text variant="title" style={{ color: allowed ? color.green : color.red, textAlign: "center" }}>
            {s.phase === "done" ? (s.accepted ? (verdict.direction === "ENTRY" ? "Entry recorded" : "Exit recorded") : "Turned back") : allowed ? verdict.direction === "ENTRY" ? "Allow entry" : "Allow exit" : "Do not allow"}
          </Text>
          <Text variant="caption" style={{ textAlign: "center" }}>
            {s.phase === "done" && s.queued ? "Saved on this device — it will sync when the network is back." : verdict.message}
          </Text>

          {verdict.person ? (
            <View style={styles.person}>
              <Avatar name={verdict.person.name} size={52} tone="gold" />
              <View style={{ flex: 1 }}>
                <Text variant="heading">{verdict.person.name}</Text>
                <Text variant="caption">{verdict.person.detail}</Text>
              </View>
              {verdict.code === "LATE_RETURN" ? (
                <View style={styles.late}><Text style={styles.lateText}>LATE</Text></View>
              ) : null}
            </View>
          ) : null}

          {(s.phase === "verdict" || s.phase === "saving") && allowed ? (
            <>
              <Text variant="label" style={{ alignSelf: "flex-start" }}>Does the face match their ID?</Text>
              <View style={styles.row}>
                <Button style={{ flex: 1 }} tone="danger" label="No match" onPress={() => void desk.confirm(false, mode === "manual" ? "MANUAL" : "QR")} disabled={s.phase === "saving"} />
                <Button style={{ flex: 1.4 }} tone="success" icon="checkmark" label={verdict.direction === "ENTRY" ? "Let in" : "Let out"} loading={s.phase === "saving"} onPress={() => void desk.confirm(true, mode === "manual" ? "MANUAL" : "QR")} />
              </View>
            </>
          ) : (
            <Button style={{ alignSelf: "stretch" }} tone={s.phase === "done" ? "gold" : "outline"} icon="scan" label="Scan next" onPress={() => { setManual(""); desk.reset(); }} />
          )}
          {s.phase === "verdict" && allowed ? (
            <Button tone="ghost" label="Cancel" onPress={desk.reset} />
          ) : null}
        </PopIn>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewfinder: { height: 300, borderRadius: radius.lg, overflow: "hidden", backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  noCam: { alignItems: "center", gap: 12, padding: 24 },
  corners: { position: "absolute", width: 240, height: 240 },
  corner: { position: "absolute", width: 34, height: 34, borderColor: color.goldLight, borderRadius: 6 },
  scanLine: { position: "absolute", left: 10, right: 10, height: 2, backgroundColor: color.goldLight, opacity: 0.9 },
  verdict: { backgroundColor: color.white, borderRadius: radius.lg, borderWidth: 1.5, padding: 20, alignItems: "center", gap: 12 },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  person: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch", padding: 12, borderRadius: radius.md, backgroundColor: color.ground },
  late: { backgroundColor: color.redSoft, paddingHorizontal: 8, height: 24, borderRadius: 12, justifyContent: "center" },
  lateText: { fontFamily: font.bodyBold, fontSize: 11, color: color.red },
  row: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  queue: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: color.amberSoft },
});
