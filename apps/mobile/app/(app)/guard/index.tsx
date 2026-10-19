import { SosBanner } from "../../../src/components/SosBanner";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import { photoSrc } from "../../../src/api/client";
import { PhotoCapture } from "../../../src/components/PhotoCapture";
import { useGateDesk } from "../../../src/features/gate/useGateDesk";
import { color, font, radius } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Avatar, Segmented } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { Bounce, FadeIn, PopIn, Shake, SuccessRings } from "../../../src/ui/motion";
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
  // Picture of the person at this exit/entry; cleared for each new scan.
  const [photo, setPhoto] = useState<string | null>(null);
  const [skipPhoto, setSkipPhoto] = useState(false);
  const resetDesk = () => {
    setPhoto(null);
    setSkipPhoto(false);
    desk.reset();
  };
  const [permission, requestPermission] = useCameraPermissions();
  const s = desk.state;
  const scanning = s.phase === "idle";

  const verdict = s.phase === "verdict" || s.phase === "saving" || s.phase === "done" ? s.verdict : null;
  const allowed = verdict?.allowed;

  return (
    <Screen
      hero={{
        greeting: "Security desk,",
        title: "Main Gate",
        chip: desk.pending.length
          ? { label: `${desk.pending.length} waiting to sync`, tone: "warn" }
          : { label: "On duty · online", tone: "safe" },
      }}
      bell
    >
      <SosBanner />
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
          <Card style={{ padding: 6 }}>
            <Segmented
              options={[
                { value: "camera", label: "Scan QR" },
                { value: "manual", label: "Code or roll no." },
              ]}
              value={mode}
              onChange={setMode}
            />
          </Card>
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
                    <Ionicons name="camera-outline" size={34} color={color.accentLight} />
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
                label="Visitor code or student roll number"
                placeholder="e.g. 606088 or 21CS104"
                autoCapitalize="characters"
                value={manual}
                onChangeText={setManual}
                hint="Visitors: the 6-digit code on their invite. Students without a phone: roll number, then check their college ID."
              />
              <Button
                label="Look up"
                icon="search"
                loading={s.phase === "checking"}
                disabled={!manual.trim()}
                onPress={() => {
                  const v = manual.trim();
                  void desk.check(/^v[12]\./.test(v) ? { qr: v } : /^\d{6}$/.test(v) ? { visitCode: v } : { rollNo: v });
                }}
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
          <Shake active={!allowed} style={{ alignItems: "center", justifyContent: "center" }}>
            {allowed ? <SuccessRings color={color.greenBright} /> : null}
            <Bounce style={[styles.badge, { backgroundColor: allowed ? color.greenSoft : color.redSoft }]}>
              <Ionicons name={allowed ? "checkmark-circle" : "close-circle"} size={40} color={allowed ? color.greenBright : color.red} />
            </Bounce>
          </Shake>
          <Text variant="title" style={{ color: allowed ? color.green : color.red, textAlign: "center" }}>
            {s.phase === "done" ? (s.accepted ? (verdict.direction === "ENTRY" ? "Entry recorded" : "Exit recorded") : "Turned back") : allowed ? verdict.direction === "ENTRY" ? "Allow entry" : "Allow exit" : "Do not allow"}
          </Text>
          <Text variant="caption" style={{ textAlign: "center" }}>
            {s.phase === "done" && s.queued ? "Saved on this device — it will sync when the network is back." : verdict.message}
          </Text>

          {verdict.offline ? (
            <View style={styles.noPhoto}>
              <Ionicons name="cloud-offline-outline" size={18} color={color.amber} />
              <Text variant="label" style={{ flex: 1, color: color.amber }}>Checked on this phone (no internet). Compare with their college ID.</Text>
            </View>
          ) : verdict.person && verdict.kind === "OUTPASS" ? (
            photoSrc(verdict.person.photoUrl) ? (
              // Big enough to compare with the face in front of the guard.
              <Image source={{ uri: photoSrc(verdict.person.photoUrl)! }} style={styles.photo} accessibilityLabel={`Photo of ${verdict.person.name} on file`} />
            ) : (
              <View style={styles.noPhoto}>
                <Ionicons name="id-card-outline" size={18} color={color.amber} />
                <Text variant="label" style={{ flex: 1, color: color.amber }}>No photo on file — check their college ID</Text>
              </View>
            )
          ) : null}

          {verdict.person ? (
            <View style={styles.person}>
              <Avatar name={verdict.person.name} size={52} tone="accent" photoUrl={verdict.person.photoUrl} />
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
              <View style={{ alignSelf: "stretch" }}>
                <PhotoCapture
                  value={photo}
                  onChange={setPhoto}
                  label={verdict.direction === "ENTRY" ? "Photo at entry" : "Photo at exit"}
                  hint={desk.photoRequired ? "Required by your college for every exit and entry." : "Kept with this gate record."}
                />
                {desk.photoRequired && !photo ? (
                  <Button compact tone="ghost" label={skipPhoto ? "Photo skipped (noted in the log)" : "Camera not working? Skip photo"} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} onPress={() => setSkipPhoto((v) => !v)} />
                ) : null}
              </View>
              <Text variant="label" style={{ alignSelf: "flex-start" }}>
                {verdict.kind === "OUTPASS" && verdict.person?.photoUrl ? "Does the face match the photo?" : "Does the face match their ID?"}
              </Text>
              <View style={styles.row}>
                <Button style={{ flex: 1 }} tone="danger" label="No match" onPress={() => void desk.confirm(false, mode === "manual" ? "MANUAL" : "QR", photo)} disabled={s.phase === "saving"} />
                <Button style={{ flex: 1.4 }} tone="success" icon="checkmark" label={verdict.direction === "ENTRY" ? "Let in" : "Let out"} loading={s.phase === "saving"} disabled={desk.photoRequired && !photo && !skipPhoto} onPress={() => void desk.confirm(true, mode === "manual" ? "MANUAL" : "QR", photo)} />
              </View>
            </>
          ) : (
            <Button style={{ alignSelf: "stretch" }} tone={s.phase === "done" ? "accent" : "outline"} icon="scan" label="Scan next" onPress={() => { setManual(""); resetDesk(); }} />
          )}
          {s.phase === "verdict" && allowed ? (
            <Button tone="ghost" label="Cancel" onPress={resetDesk} />
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
  corner: { position: "absolute", width: 34, height: 34, borderColor: color.accentLight, borderRadius: 6 },
  scanLine: { position: "absolute", left: 10, right: 10, height: 2, backgroundColor: color.accentLight, opacity: 0.9 },
  verdict: { backgroundColor: color.white, borderRadius: radius.lg, borderWidth: 1.5, padding: 20, alignItems: "center", gap: 12 },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  photo: { width: 176, height: 176, borderRadius: radius.lg, backgroundColor: color.ground, borderWidth: 3, borderColor: color.white },
  noPhoto: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "stretch", padding: 12, borderRadius: radius.md, backgroundColor: color.amberSoft },
  person: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch", padding: 12, borderRadius: radius.md, backgroundColor: color.ground },
  late: { backgroundColor: color.redSoft, paddingHorizontal: 8, height: 24, borderRadius: 12, justifyContent: "center" },
  lateText: { fontFamily: font.bodyBold, fontSize: 11, color: color.red },
  row: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  queue: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: color.amberSoft },
});
