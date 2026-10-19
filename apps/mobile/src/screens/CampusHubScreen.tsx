import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { photoSrc, rupees, type EventDto, type MarketItemDto, type OfferDto } from "../api/client";
import { useSession } from "../auth/session";
import { BannerCarousel } from "../components/BannerCarousel";
import { useCampusHub } from "../features/campus/useCampus";
import { color, font, radius, shadow } from "../theme/tokens";
import { ErrorNote, Loading, SectionTitle } from "../ui/bits";
import { CountUp, FadeIn, PressScale } from "../ui/motion";
import { QuickActions } from "../ui/QuickActions";
import { Screen } from "../ui/Screen";
import { Text } from "../ui/Text";

const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function EventCard({ e, index }: { e: EventDto; index: number }) {
  const d = new Date(e.startsAt);
  return (
    <FadeIn index={index}>
      <PressScale onPress={() => router.push(`/events/${e.id}`)} accessibilityRole="button" accessibilityLabel={e.title} style={[styles.event, shadow.card]}>
        <View style={styles.dateBadge}>
          <Text style={styles.dateDay}>{d.getDate()}</Text>
          <Text style={styles.dateMon}>{MONTH[d.getMonth()]}</Text>
        </View>
        <Text variant="eyebrow" numberOfLines={1}>{e.category}</Text>
        <Text variant="heading" numberOfLines={2}>{e.title}</Text>
        <Text variant="caption" numberOfLines={1}>{e.venue}</Text>
        <View style={styles.eventFoot}>
          {e.registered ? (
            <View style={[styles.tag, { backgroundColor: color.greenSoft }]}>
              <Ionicons name="checkmark-circle" size={13} color={color.green} />
              <Text style={[styles.tagText, { color: color.green }]}>Registered</Text>
            </View>
          ) : e.seatsLeft !== null ? (
            <Text variant="caption" style={{ color: e.seatsLeft < 10 ? color.red : color.muted }}>{e.seatsLeft ? `${e.seatsLeft} seats left` : "Full"}</Text>
          ) : (
            <Text variant="caption">{e.registrations} going</Text>
          )}
        </View>
      </PressScale>
    </FadeIn>
  );
}

export function ItemTile({ i, index }: { i: MarketItemDto; index: number }) {
  const src = photoSrc(i.photoUrl);
  return (
    <FadeIn index={index} style={{ width: "48%" }}>
      <PressScale onPress={() => router.push(`/market/${i.id}`)} accessibilityRole="button" accessibilityLabel={`${i.title}, ${i.price ? `₹${i.price}` : "free"}`} style={[styles.item, shadow.card]}>
        {src ? <Image source={{ uri: src }} style={styles.itemPhoto} /> : <View style={[styles.itemPhoto, styles.noPhoto]}><Ionicons name="pricetag-outline" size={26} color={color.indigo} /></View>}
        <View style={{ padding: 10, gap: 2 }}>
          <Text style={styles.price}>{i.price ? `₹${i.price.toLocaleString("en-IN")}` : "Free"}</Text>
          <Text variant="label" numberOfLines={1}>{i.title}</Text>
          <Text variant="caption" numberOfLines={1}>{i.seller.hostel ?? i.category}</Text>
        </View>
      </PressScale>
    </FadeIn>
  );
}

const OFFER_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  "Coding & assessments": "code-slash",
  "Courses & training": "school",
  "Internships & consulting": "briefcase",
  "Food near campus": "fast-food",
  Coupons: "pricetags",
};

export function OfferCard({ o, index, wide }: { o: OfferDto; index: number; wide?: boolean }) {
  return (
    <FadeIn index={index}>
      <PressScale onPress={() => router.push({ pathname: "/offers", params: { focus: o.id } })} accessibilityRole="button" accessibilityLabel={`${o.title} from ${o.partnerName}`} style={[styles.offer, wide && { width: "100%" }, shadow.card]}>
        <View style={styles.offerIcon}>
          <Ionicons name={OFFER_ICON[o.category] ?? "gift"} size={20} color={color.white} />
        </View>
        <Text variant="eyebrow" numberOfLines={1}>{o.partnerName}</Text>
        <Text variant="label" numberOfLines={2}>{o.title}</Text>
        {o.couponCode ? (
          <View style={styles.coupon}>
            <Text style={styles.couponText}>{o.couponCode}</Text>
          </View>
        ) : null}
      </PressScale>
    </FadeIn>
  );
}

/** The Campus tab: fees due, what's on, buy & sell, and offers. */
export function CampusHubScreen() {
  const { user } = useSession();
  const vm = useCampusHub();
  const h = vm.hub;
  const fees = h?.fees;
  const nextDue = fees?.fees.find((f) => f.status === "DUE");

  return (
    <Screen
      hero={{
        greeting: "Campus life",
        title: "What's happening",
        chip: fees && fees.totals.overdue
          ? { label: `${fees.totals.overdue} fee${fees.totals.overdue > 1 ? "s" : ""} overdue`, tone: "danger" }
          : { label: h ? `${h.events.length} upcoming event${h.events.length === 1 ? "" : "s"}` : "Loading…", tone: "info" },
      }}
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      bell
    >
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading rows={2} /> : null}

      <BannerCarousel />

      {fees && fees.totals.open > 0 ? (
        <FadeIn>
          <PressScale onPress={() => router.push("/fees")} accessibilityRole="button" style={[styles.fees, shadow.primary]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.feesLabel}>{user?.role === "PARENT" ? "Fees due for your child" : "Fees due"}</Text>
              <CountUp value={fees.totals.duePaise / 100} format={(n) => `₹${Math.round(n).toLocaleString("en-IN")}`} style={styles.feesAmount} />
              {nextDue ? (
                <Text style={styles.feesSub} numberOfLines={1}>
                  {nextDue.title} · {nextDue.overdue ? "overdue" : `due ${new Date(nextDue.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                </Text>
              ) : null}
            </View>
            <View style={styles.payBtn}>
              <Text style={styles.payText}>Pay</Text>
              <Ionicons name="arrow-forward" size={16} color={color.indigoDeep} />
            </View>
          </PressScale>
        </FadeIn>
      ) : null}

      <FadeIn index={1}>
        <QuickActions
          actions={[
            { key: "events", label: "Events", icon: "calendar-outline", onPress: () => router.push("/events") },
            ...(h?.marketAvailable !== false ? [{ key: "market", label: "Buy & sell", icon: "storefront-outline" as const, onPress: () => router.push("/market") }] : []),
            ...(vm.paysFees ? [{ key: "fees", label: "Fees", icon: "wallet-outline" as const, badge: fees?.totals.overdue, onPress: () => router.push("/fees") }] : []),
            ...(vm.showOffers ? [{ key: "offers", label: "Offers", icon: "gift-outline" as const, onPress: () => router.push("/offers") }] : []),
          ]}
        />
      </FadeIn>

      {h ? (
        <>
          <SectionTitle title="Coming up" action={{ label: "See all", onPress: () => router.push("/events") }} />
          {h.events.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} style={styles.railWrap}>
              {h.events.slice(0, 8).map((e, i) => <EventCard key={e.id} e={e} index={i} />)}
            </ScrollView>
          ) : (
            <Pressable onPress={() => router.push("/events/new")} style={styles.emptyRow}>
              <Ionicons name="add-circle-outline" size={20} color={color.indigo} />
              <Text variant="label" style={{ color: color.indigo }}>Nothing planned yet. Propose an event</Text>
            </Pressable>
          )}

          {h.marketAvailable ? (
            <>
              <SectionTitle title="Buy & sell" action={{ label: "Sell something", onPress: () => router.push("/market/new") }} />
              {h.market.length ? (
                <View style={styles.grid}>{h.market.slice(0, 4).map((i, n) => <ItemTile key={i.id} i={i} index={n} />)}</View>
              ) : (
                <Text variant="caption">No listings yet. Books, cycles and gadgets from other students will show here.</Text>
              )}
            </>
          ) : null}

          {vm.showOffers && h.offers.length ? (
            <>
              <View style={styles.offerHead}>
                <SectionTitle title="Offers & opportunities" action={{ label: "See all", onPress: () => router.push("/offers") }} />
              </View>
              <Text variant="caption" style={{ marginTop: -8 }}>Sponsored · the same for every student</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} style={styles.railWrap}>
                {h.offers.slice(0, 8).map((o, i) => <OfferCard key={o.id} o={o} index={i} />)}
              </ScrollView>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fees: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18, borderRadius: radius.lg, backgroundColor: color.indigo },
  feesLabel: { fontFamily: font.bodyBold, fontSize: 13, color: color.headSub },
  feesAmount: { fontFamily: font.display, fontSize: 30, color: color.white },
  feesSub: { fontFamily: font.body, fontSize: 13, color: "#E0E7FF" },
  payBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: color.white, paddingHorizontal: 14, height: 40, borderRadius: radius.pill },
  payText: { fontFamily: font.bodyBold, fontSize: 14, color: color.indigoDeep },
  railWrap: { marginHorizontal: -20 },
  rail: { paddingHorizontal: 20, gap: 12, paddingBottom: 6 },
  event: { width: 200, backgroundColor: color.white, borderRadius: radius.lg, padding: 14, gap: 4 },
  dateBadge: { width: 46, height: 50, borderRadius: 12, backgroundColor: color.indigoTint, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  dateDay: { fontFamily: font.display, fontSize: 19, color: color.indigoDeep, lineHeight: 22 },
  dateMon: { fontFamily: font.bodyBold, fontSize: 10, color: color.indigo, letterSpacing: 0.8 },
  eventFoot: { marginTop: 6 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, height: 24, borderRadius: radius.pill },
  tagText: { fontFamily: font.bodyBold, fontSize: 11.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  item: { backgroundColor: color.white, borderRadius: radius.lg, overflow: "hidden" },
  itemPhoto: { width: "100%", aspectRatio: 1.25, backgroundColor: color.field },
  noPhoto: { alignItems: "center", justifyContent: "center", backgroundColor: color.indigoTint },
  price: { fontFamily: font.display, fontSize: 17, color: color.ink },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderRadius: radius.md, backgroundColor: color.indigoTint },
  offerHead: { marginTop: 4 },
  offer: { width: 168, backgroundColor: color.white, borderRadius: radius.lg, padding: 14, gap: 4 },
  offerIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: color.accent, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  coupon: { alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1.5, borderStyle: "dashed", borderColor: color.accentLight },
  couponText: { fontFamily: font.bodyBold, fontSize: 12, color: color.accentText, letterSpacing: 0.5 },
});
