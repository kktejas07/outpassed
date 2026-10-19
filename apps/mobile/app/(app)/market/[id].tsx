import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, Linking, Platform, StyleSheet, View } from "react-native";
import { campus, errorMessage, photoSrc } from "../../../src/api/client";
import { useSession } from "../../../src/auth/session";
import { useQuery } from "../../../src/lib/useQuery";
import { color, font, radius, shadow } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { ErrorNote, KeyValue, Loading } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn, PopIn } from "../../../src/ui/motion";
import { useRibbon } from "../../../src/ui/Ribbon";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

export default function MarketItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useSession();
  const ribbon = useRibbon();
  const q = useQuery((t) => campus.marketItem(t, id), [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const i = q.data;

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const openChat = (url: string) => (Platform.OS === "web" ? globalThis.open?.(url, "_blank") : void Linking.openURL(url));

  if (!i || !token) return <Screen title="Item" back>{q.error ? <ErrorNote message={q.error} onRetry={q.refresh} /> : <Loading rows={1} />}</Screen>;
  const src = photoSrc(i.photoUrl);

  return (
    <Screen
      title={i.title}
      eyebrow={i.category}
      back
      footer={
        i.mine ? (
          i.status === "ACTIVE" ? (
            <View style={styles.row}>
              <Button tone="outline" label="Remove" style={{ flex: 1 }} loading={busy} onPress={() => void act(() => campus.removeItem(token, id), () => router.back())} />
              <Button tone="success" icon="checkmark" label="Mark sold" style={{ flex: 1.3 }} loading={busy} onPress={() => void act(async () => q.setData(await campus.sold(token, id)), () => ribbon.show({ tone: "success", title: "Marked as sold", celebrate: true }))} />
            </View>
          ) : undefined
        ) : i.status === "ACTIVE" ? (
          i.contactUrl ? (
            <Button icon="logo-whatsapp" label={`Chat with ${i.seller.name.split(" ")[0]} on WhatsApp`} onPress={() => openChat(i.contactUrl!)} />
          ) : (
            <Button
              icon="hand-right-outline"
              label="I'm interested"
              loading={busy}
              onPress={() =>
                void act(async () => {
                  const next = await campus.interested(token, id);
                  q.setData(next);
                  ribbon.show({ tone: "success", title: `${i.seller.name.split(" ")[0]} has been told`, body: next.contactUrl ? "You can chat on WhatsApp now." : "They'll get back to you." });
                })
              }
            />
          )
        ) : undefined
      }
    >
      <FadeIn>
        {src ? <Image source={{ uri: src }} style={[styles.photo, shadow.card]} /> : <View style={[styles.photo, styles.noPhoto]}><Ionicons name="pricetag-outline" size={44} color={color.indigo} /></View>}
      </FadeIn>
      <FadeIn index={1}>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{i.price ? `₹${i.price.toLocaleString("en-IN")}` : "Free"}</Text>
          {i.status !== "ACTIVE" ? <Text variant="label" style={{ color: color.muted }}>{i.status === "PENDING" ? "Waiting for office approval" : i.status === "SOLD" ? "Sold" : "Not available"}</Text> : null}
        </View>
      </FadeIn>
      {i.mine && i.interests ? (
        <PopIn style={styles.interest}>
          <Ionicons name="people" size={18} color={color.indigo} />
          <Text variant="label" style={{ flex: 1 }}>{i.interests} student{i.interests > 1 ? "s" : ""} interested. Check your alerts for their details.</Text>
        </PopIn>
      ) : null}
      <FadeIn index={2}>
        <Card style={{ gap: 10 }}>
          <Text variant="body" style={{ color: color.ink }}>{i.description}</Text>
        </Card>
      </FadeIn>
      <FadeIn index={3}>
        <Card style={{ paddingVertical: 6 }}>
          <KeyValue label="Condition" value={i.condition} />
          <KeyValue label="Seller" value={i.seller.name} />
          {i.seller.hostel ? <KeyValue label="Hostel" value={i.seller.hostel} /> : null}
          <KeyValue label="Listed" value={new Date(i.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
        </Card>
      </FadeIn>
      {error ? <ErrorNote message={error} /> : null}
      {!i.mine ? (
        reporting ? (
          <PopIn style={{ gap: 10 }}>
            <Field label="What's wrong with this listing?" value={reason} onChangeText={setReason} placeholder="e.g. fake, not a student item, offensive" />
            <Button
              compact
              tone="danger"
              label="Report"
              disabled={reason.trim().length < 3}
              loading={busy}
              onPress={() => void act(() => campus.report(token, id, reason.trim()), () => { setReporting(false); ribbon.show({ tone: "info", title: "Reported", body: "Thanks. The office will take a look." }); })}
            />
          </PopIn>
        ) : (
          <Button compact tone="ghost" icon="flag-outline" label="Report this listing" style={{ alignSelf: "center" }} onPress={() => setReporting(true)} />
        )
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", aspectRatio: 1.25, borderRadius: radius.lg, backgroundColor: color.field },
  noPhoto: { alignItems: "center", justifyContent: "center", backgroundColor: color.indigoTint },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  price: { fontFamily: font.display, fontSize: 30, color: color.ink },
  interest: { flexDirection: "row", gap: 10, alignItems: "center", padding: 14, borderRadius: radius.md, backgroundColor: color.indigoTint },
  row: { flexDirection: "row", gap: 10 },
});
