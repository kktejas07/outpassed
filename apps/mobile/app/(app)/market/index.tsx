import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Image, StyleSheet, View } from "react-native";
import { photoSrc, type MarketItemDto } from "../../../src/api/client";
import { useMarket } from "../../../src/features/campus/useCampus";
import { color, font, radius, shadow } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Chips, Empty, ErrorNote, Loading, Segmented } from "../../../src/ui/bits";
import { FadeIn, PressScale } from "../../../src/ui/motion";
import { Pill } from "../../../src/ui/Pill";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

const STATUS: Record<MarketItemDto["status"], { label: string; tone: "amber" | "green" | "red" | "neutral" | "indigo" } | null> = {
  PENDING: { label: "In review", tone: "amber" },
  ACTIVE: null,
  SOLD: { label: "Sold", tone: "neutral" },
  REJECTED: { label: "Not approved", tone: "red" },
  REMOVED: { label: "Removed", tone: "neutral" },
};

function Tile({ i, index }: { i: MarketItemDto; index: number }) {
  const src = photoSrc(i.photoUrl);
  const s = STATUS[i.status];
  return (
    <FadeIn index={index} style={{ width: "48%" }}>
      <PressScale onPress={() => router.push(`/market/${i.id}`)} accessibilityRole="button" accessibilityLabel={`${i.title}, ${i.price ? `₹${i.price}` : "free"}`} style={[styles.tile, shadow.card]}>
        {src ? <Image source={{ uri: src }} style={styles.photo} /> : <View style={[styles.photo, styles.noPhoto]}><Ionicons name="pricetag-outline" size={28} color={color.indigo} /></View>}
        {s ? <View style={styles.badge}><Pill label={s.label} tone={s.tone} /></View> : null}
        <View style={{ padding: 10, gap: 2 }}>
          <Text style={styles.price}>{i.price ? `₹${i.price.toLocaleString("en-IN")}` : "Free"}</Text>
          <Text variant="label" numberOfLines={2}>{i.title}</Text>
          <Text variant="caption" numberOfLines={1}>{i.condition} · {i.seller.hostel ?? i.seller.name}</Text>
        </View>
      </PressScale>
    </FadeIn>
  );
}

/** Students buy and sell books, cycles and gadgets among themselves. */
export default function Market() {
  const vm = useMarket();
  return (
    <Screen
      title="Buy & sell"
      eyebrow="Campus marketplace"
      back
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      right={<Button compact icon="add" label="Sell" onPress={() => router.push("/market/new")} />}
    >
      <Segmented options={[{ value: "browse", label: "Browse" }, { value: "mine", label: "My listings" }]} value={vm.scope} onChange={vm.setScope} />
      {vm.scope === "browse" && vm.categories.length ? (
        <Chips options={[{ value: "", label: "All" }, ...vm.categories.map((c) => ({ value: c, label: c }))]} value={vm.category} onChange={vm.setCategory} />
      ) : null}
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading rows={2} /> : null}
      {!vm.loading && vm.items.length === 0 ? (
        <Empty icon="storefront-outline" title={vm.scope === "mine" ? "You haven't listed anything" : "Nothing here yet"} body="Sell old books, a cycle or a lamp to other students. Listings are checked by the office first." />
      ) : null}
      <View style={styles.grid}>{vm.items.map((i, n) => <Tile key={i.id} i={i} index={n} />)}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  tile: { backgroundColor: color.white, borderRadius: radius.lg, overflow: "hidden" },
  photo: { width: "100%", aspectRatio: 1.15, backgroundColor: color.field },
  noPhoto: { alignItems: "center", justifyContent: "center", backgroundColor: color.indigoTint },
  badge: { position: "absolute", top: 8, left: 8 },
  price: { fontFamily: font.display, fontSize: 17, color: color.ink },
});
