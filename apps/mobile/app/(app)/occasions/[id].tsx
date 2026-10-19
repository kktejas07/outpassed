import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { campus } from "../../../src/api/client";
import { useSession } from "../../../src/auth/session";
import { themeOf } from "../../../src/components/BannerCarousel";
import { useQuery } from "../../../src/lib/useQuery";
import { ItemTile, OfferCard } from "../../../src/screens/CampusHubScreen";
import { font, radius } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Empty, ErrorNote, Loading, SectionTitle } from "../../../src/ui/bits";
import { CountUp, FadeIn, PopIn } from "../../../src/ui/motion";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

const DAY = 86_400_000;

function timeLeft(startsAt: string, endsAt: string) {
  const now = Date.now();
  if (new Date(startsAt).getTime() > now) return `Starts ${new Date(startsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return "This sale has ended";
  const days = Math.floor(ms / DAY);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
  return `${Math.max(1, Math.round(ms / 3_600_000))} hours left`;
}

/** One campus sale or season: its banner, offers and student listings. */
export default function OccasionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const q = useQuery((t) => campus.occasion(t, id), [id]);
  const d = q.data;
  const o = d?.occasion;
  const t = themeOf(o?.theme ?? "indigo");
  const canSell = !!d?.marketAvailable && !!o?.live && user?.role !== "PARENT" && user?.role !== "GUARD";

  return (
    <Screen
      title={o?.name ?? "Campus sale"}
      eyebrow="Campus sale"
      back
      refreshing={q.refreshing}
      onRefresh={q.refresh}
      footer={canSell ? <Button icon="pricetag-outline" label="Sell something for this sale" onPress={() => router.push({ pathname: "/market/new", params: { occasionId: id } })} /> : undefined}
    >
      {q.error ? <ErrorNote message={q.error} onRetry={q.refresh} /> : null}
      {q.loading ? <Loading rows={3} /> : null}
      {o && d ? (
        <>
          <PopIn style={[styles.hero, { backgroundColor: t.bg }]}>
            <View style={[styles.ring, { borderColor: t.ring, width: 240, height: 240, right: -80, top: -90 }]} />
            <View style={[styles.ring, { borderColor: t.ring, width: 140, height: 140, left: -50, bottom: -70, opacity: 0.45 }]} />
            <View style={styles.icon}>
              <Ionicons name={o.icon as keyof typeof Ionicons.glyphMap} size={34} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>{o.name}</Text>
            <Text style={[styles.sub, { color: t.sub }]}>{o.tagline}</Text>
            <View style={[styles.pill, { backgroundColor: t.chip }]}>
              <Ionicons name="time-outline" size={14} color="#FFFFFF" />
              <Text style={styles.pillText}>{timeLeft(o.startsAt, o.endsAt)}</Text>
            </View>
            <View style={styles.stats}>
              {d.marketAvailable ? (
                <View style={styles.stat}>
                  <CountUp value={d.items.length} style={styles.statN} />
                  <Text style={[styles.statL, { color: t.sub }]}>student listings</Text>
                </View>
              ) : null}
              {d.offers.length ? (
                <View style={styles.stat}>
                  <CountUp value={d.offers.length} style={styles.statN} />
                  <Text style={[styles.statL, { color: t.sub }]}>offers nearby</Text>
                </View>
              ) : null}
            </View>
          </PopIn>

          {d.offers.length ? (
            <>
              <SectionTitle title="Offers for this sale" />
              <Text variant="caption" style={{ marginTop: -8 }}>Sponsored · the same for every student</Text>
              {d.offers.map((x, i) => <OfferCard key={x.id} o={x} index={i} wide />)}
            </>
          ) : null}

          {d.marketAvailable ? (
            <>
              <SectionTitle title="From students" action={{ label: "All of Buy & sell", onPress: () => router.push("/market") }} />
              {d.items.length ? (
                <View style={styles.grid}>{d.items.map((i, n) => <ItemTile key={i.id} i={i} index={n} />)}</View>
              ) : (
                <FadeIn>
                  <Empty icon="pricetags-outline" title="No listings yet" body={canSell ? "Be the first: list something for this sale." : undefined} />
                </FadeIn>
              )}
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: 22, gap: 8, overflow: "hidden" },
  ring: { position: "absolute", borderRadius: 999, borderWidth: 22, opacity: 0.32 },
  icon: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 32, color: "#FFFFFF" },
  sub: { fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, height: 30, borderRadius: 999, marginTop: 4 },
  pillText: { fontFamily: font.bodyBold, fontSize: 12.5, color: "#FFFFFF" },
  stats: { flexDirection: "row", gap: 24, marginTop: 10 },
  stat: { gap: 0 },
  statN: { fontFamily: font.display, fontSize: 24, color: "#FFFFFF" },
  statL: { fontFamily: font.bodySemi, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
});
