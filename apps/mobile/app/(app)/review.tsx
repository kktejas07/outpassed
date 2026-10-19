import { router } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { campus, errorMessage, photoSrc } from "../../src/api/client";
import { useSession } from "../../src/auth/session";
import { useQuery } from "../../src/lib/useQuery";
import { color, font, radius, shadow } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Empty, ErrorNote, Loading, Segmented } from "../../src/ui/bits";
import { FadeIn } from "../../src/ui/motion";
import { useRibbon } from "../../src/ui/Ribbon";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Admins approve student events and marketplace listings before others see them. */
export default function Review() {
  const { token } = useSession();
  const ribbon = useRibbon();
  const [tab, setTab] = useState<"events" | "market">("events");
  const q = useQuery(async (t) => ({ events: await campus.events(t, "pending"), items: (await campus.market(t, { scope: "pending" })).items }));
  const [error, setError] = useState<string | null>(null);

  async function decide(fn: () => Promise<unknown>, title: string) {
    setError(null);
    try {
      await fn();
      ribbon.show({ tone: "success", title });
      void q.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const events = q.data?.events ?? [];
  const items = q.data?.items ?? [];
  return (
    <Screen title="Review posts" eyebrow="Admin" back refreshing={q.refreshing} onRefresh={q.refresh}>
      <Segmented options={[{ value: "events", label: `Events · ${events.length}` }, { value: "market", label: `Buy & sell · ${items.length}` }]} value={tab} onChange={setTab} />
      {error ? <ErrorNote message={error} /> : null}
      {q.loading ? <Loading rows={2} /> : null}
      {tab === "events" ? (
        <>
          {!q.loading && events.length === 0 ? <Empty icon="calendar-outline" title="No events waiting" body="Events students propose show here for approval." /> : null}
          {events.map((e, i) => (
            <FadeIn key={e.id} index={i}>
              <View style={[styles.card, shadow.card]}>
                <Text variant="eyebrow">{e.category} · by {e.organizer.name}</Text>
                <Text variant="heading">{e.title}</Text>
                <Text variant="caption">{when(e.startsAt)} · {e.venue}{e.capacity ? ` · ${e.capacity} seats` : ""}</Text>
                <Text variant="body" style={{ color: color.ink }} numberOfLines={4}>{e.description}</Text>
                <View style={styles.row}>
                  <Button compact tone="danger" label="Decline" style={{ flex: 1 }} onPress={() => token && void decide(() => campus.decideEvent(token, e.id, "REJECT", "Not approved by the office"), "Declined")} />
                  <Button compact tone="success" icon="megaphone-outline" label="Publish" style={{ flex: 1.6 }} onPress={() => token && void decide(() => campus.decideEvent(token, e.id, "APPROVE"), "Approved: students told")} />
                </View>
              </View>
            </FadeIn>
          ))}
        </>
      ) : (
        <>
          {!q.loading && items.length === 0 ? <Empty icon="storefront-outline" title="No listings waiting" body="New and reported listings show here." /> : null}
          {items.map((it, i) => {
            const src = photoSrc(it.photoUrl);
            return (
              <FadeIn key={it.id} index={i}>
                <View style={[styles.card, shadow.card]}>
                  <View style={styles.row}>
                    {src ? <Image source={{ uri: src }} style={styles.thumb} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text variant="heading" numberOfLines={2}>{it.title}</Text>
                      <Text style={styles.price}>{it.price ? `₹${it.price.toLocaleString("en-IN")}` : "Free"}</Text>
                      <Text variant="caption">{it.category} · {it.seller.name}</Text>
                    </View>
                  </View>
                  <Text variant="body" style={{ color: color.ink }} numberOfLines={3}>{it.description}</Text>
                  <View style={styles.row}>
                    <Button compact tone="ghost" label="Open" onPress={() => router.push(`/market/${it.id}`)} />
                    <Button compact tone="danger" label="Reject" style={{ flex: 1 }} onPress={() => token && void decide(() => campus.decideItem(token, it.id, "REJECT"), "Rejected")} />
                    <Button compact tone="success" icon="checkmark" label="Approve" style={{ flex: 1.2 }} onPress={() => token && void decide(() => campus.decideItem(token, it.id, "APPROVE"), "Listing is live")} />
                  </View>
                </View>
              </FadeIn>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.white, borderRadius: radius.lg, padding: 16, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: color.field },
  price: { fontFamily: font.display, fontSize: 16, color: color.ink },
});
