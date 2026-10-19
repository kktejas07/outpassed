import { StyleSheet, View } from "react-native";
import { describeRepeat } from "@outpassed/shared/passToken";
import { when } from "../lib/format";
import { color, font, radius, shadow } from "../theme/tokens";
import { QrCode } from "../ui/QrCode";
import { Text } from "../ui/Text";

/**
 * The visitor's pass: QR to scan, or a 6-digit code to read out, with the
 * time window. Used on the host's screen and on the public pass link.
 */
export function InvitePass({
  hostName,
  visitorName,
  qrToken,
  code,
  validFrom,
  validTo,
  repeat,
  campusName,
  campusAddress,
}: {
  hostName: string;
  visitorName?: string;
  qrToken: string | null;
  code: string;
  validFrom: string;
  validTo: string;
  /** Regular pass: these weekdays and hours until validTo. */
  repeat?: { days: number[]; from: string; to: string } | null;
  campusName?: string;
  campusAddress?: string;
}) {
  return (
    <View style={[styles.frame, shadow.accent]}>
      <View style={styles.pass}>
        {visitorName ? <Text variant="caption" style={{ textAlign: "center" }}>Hi {visitorName.split(" ")[0]},</Text> : null}
        <Text variant="title" style={{ textAlign: "center" }}>{hostName} has invited you</Text>
        <Text variant="caption" style={{ textAlign: "center", color: color.accentText }}>Show this QR code or the entry code to the guard at the gate</Text>
        {qrToken ? (
          <View style={styles.qr}>
            <QrCode value={qrToken} size={188} />
          </View>
        ) : null}
        {qrToken && code ? (
          <View style={styles.or}>
            <View style={styles.rule} />
            <Text variant="caption">OR</Text>
            <View style={styles.rule} />
          </View>
        ) : null}
        {code ? (
          <View style={styles.code} accessibilityLabel={`Entry code ${code.split("").join(" ")}`}>
            <Text style={styles.codeText}>{code}</Text>
          </View>
        ) : null}
        {repeat ? (
          <>
            <Text variant="label" style={{ textAlign: "center" }}>{describeRepeat(repeat)}</Text>
            <Text variant="caption" style={{ textAlign: "center" }}>Regular pass · until {when(validTo)}</Text>
          </>
        ) : (
          <Text variant="label" style={{ textAlign: "center" }}>{when(validFrom)} – {when(validTo)}</Text>
        )}
        {campusName ? (
          <View style={{ alignItems: "center", gap: 2 }}>
            <Text variant="heading" style={{ textAlign: "center" }}>{campusName}</Text>
            {campusAddress ? <Text variant="caption" style={{ textAlign: "center" }}>{campusAddress}</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 26, padding: 3, backgroundColor: color.accentFrame, alignSelf: "stretch" },
  pass: { backgroundColor: color.white, borderRadius: 23, paddingVertical: 22, paddingHorizontal: 18, alignItems: "center", gap: 12 },
  qr: { padding: 10, borderRadius: 16, borderWidth: 1, borderColor: color.line, backgroundColor: color.white },
  or: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "stretch", paddingHorizontal: 40 },
  rule: { flex: 1, height: 1, backgroundColor: color.line },
  code: { backgroundColor: color.ink, borderRadius: radius.md, paddingHorizontal: 26, paddingVertical: 10, borderWidth: 2, borderColor: color.accentFrame },
  codeText: { fontFamily: font.display, fontSize: 36, letterSpacing: 6, color: color.white, fontVariant: ["tabular-nums"] },
});
