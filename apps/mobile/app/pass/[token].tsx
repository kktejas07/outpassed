import Ionicons from "@expo/vector-icons/Ionicons";
import type { PublicVisitPass } from "@outpassed/shared";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "../../src/api/client";
import { Brand } from "../../src/components/Brand";
import { InvitePass } from "../../src/components/InvitePass";
import { color } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { PopIn } from "../../src/ui/motion";
import { Text } from "../../src/ui/Text";

/**
 * Public page for a visitor's pass link. No sign-in: the visitor opens the
 * link from WhatsApp/SMS and shows the QR or reads out the code at the gate.
 */
export default function VisitorPassPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const insets = useSafeAreaInsets();
  const [pass, setPass] = useState<PublicVisitPass | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPass(await api.visitPass(token));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load this pass"));
    }
  }, [token]);

  // The QR inside is signed and refreshed so a stale screenshot isn't the only copy.
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  const over = pass && (pass.status === "CHECKED_OUT" || pass.status === "REJECTED" || new Date(pass.validTo) < new Date());

  return (
    <ScrollView style={{ backgroundColor: color.ground }} contentContainerStyle={[styles.page, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 32 }]}>
      <Brand size={40} />
      {!pass && !error ? <ActivityIndicator color={color.accent} style={{ marginTop: 40 }} /> : null}
      {error ? (
        <View style={styles.note}>
          <Ionicons name="alert-circle-outline" size={26} color={color.red} />
          <Text variant="heading" style={{ textAlign: "center" }}>{error}</Text>
          <Text variant="caption" style={{ textAlign: "center" }}>Ask the person who invited you to send the pass again.</Text>
          <Button tone="outline" label="Try again" onPress={load} />
        </View>
      ) : null}
      {pass && over ? (
        <View style={styles.note}>
          <Ionicons name="time-outline" size={26} color={color.muted} />
          <Text variant="heading" style={{ textAlign: "center" }}>
            {pass.status === "REJECTED" ? "This visit was declined" : pass.status === "CHECKED_OUT" ? "This visit is complete" : "This pass has expired"}
          </Text>
          <Text variant="caption" style={{ textAlign: "center" }}>Ask {pass.hostName} for a new invite if you need to come back.</Text>
        </View>
      ) : null}
      {pass && !over && pass.status === "PENDING_HOST" ? (
        <View style={styles.note}>
          <Ionicons name="hourglass-outline" size={26} color={color.amber} />
          <Text variant="heading" style={{ textAlign: "center" }}>Waiting for {pass.hostName} to approve</Text>
          <Text variant="caption" style={{ textAlign: "center" }}>The guard will let you in once they approve.</Text>
        </View>
      ) : null}
      {pass && !over && pass.status !== "PENDING_HOST" ? (
        <PopIn style={{ alignSelf: "stretch" }}>
          <InvitePass
            hostName={pass.hostName}
            visitorName={pass.visitorName}
            qrToken={pass.qrToken}
            code={pass.code}
            validFrom={pass.validFrom}
            validTo={pass.validTo}
            campusName={pass.campus.name}
            campusAddress={pass.campus.address}
          />
          <Text variant="caption" style={{ textAlign: "center", marginTop: 14 }}>
            {pass.status === "CHECKED_IN" ? "You're checked in. Show this again when you leave." : `Purpose: ${pass.purpose}`}
          </Text>
        </PopIn>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, alignItems: "center", gap: 20, maxWidth: 460, width: "100%", alignSelf: "center" },
  note: { alignSelf: "stretch", alignItems: "center", gap: 10, padding: 24, borderRadius: 22, backgroundColor: color.white, borderWidth: 1, borderColor: color.line },
});
