import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { campus } from "../../src/api/client";
import { useSession } from "../../src/auth/session";
import { useQuery } from "../../src/lib/useQuery";
import { color, font, radius, shadow } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Chips, Empty, ErrorNote, Loading } from "../../src/ui/bits";
import { FadeIn } from "../../src/ui/motion";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  "Coding & assessments": "code-slash",
  "Courses & training": "school",
  "Internships & consulting": "briefcase",
  "Food near campus": "fast-food",
  Coupons: "pricetags",
};

/**
 * Sponsored listings picked by the college: assessments, training, food
 * nearby, student coupons. Everyone sees the same list; nothing is targeted.
 */
export default function Offers() {
  const { token } = useSession();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const q = useQuery((t) => campus.offers(t));
  const [category, setCategory] = useState("");
  const offers = (q.data?.offers ?? []).filter((o) => !category || o.category === category);
  const cats = [...new Set((q.data?.offers ?? []).map((o) => o.category))];

  async function open(id: string) {
    if (!token) return;
    const { url } = await campus.openOffer(token, id);
    if (!url) return;
    if (Platform.OS === "web") globalThis.open?.(url, "_blank");
    else await Linking.openURL(url);
  }

  return (
    <Screen title="Offers & opportunities" eyebrow="Sponsored" back refreshing={q.refreshing} onRefresh={q.refresh}>
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={18} color={color.indigo} />
        <Text variant="caption" style={{ flex: 1, color: color.ink }}>Chosen by your college. Every student sees the same offers; Outpass doesn't track what you open.</Text>
      </View>
      {cats.length > 1 ? <Chips options={[{ value: "", label: "All" }, ...cats.map((c) => ({ value: c, label: c }))]} value={category} onChange={setCategory} /> : null}
      {q.error ? <ErrorNote message={q.error} onRetry={q.refresh} /> : null}
      {q.loading ? <Loading rows={2} /> : null}
      {!q.loading && offers.length === 0 ? <Empty icon="gift-outline" title="No offers right now" body="Course deals, mock tests, food near campus and student coupons will show here." /> : null}
      {offers.map((o, i) => (
        <FadeIn key={o.id} index={i}>
          <View style={[styles.card, shadow.card, focus === o.id && styles.focus]}>
            <View style={styles.head}>
              <View style={styles.icon}><Ionicons name={ICON[o.category] ?? "gift"} size={20} color={color.white} /></View>
              <View style={{ flex: 1 }}>
                <Text variant="eyebrow">{o.category}</Text>
                <Text variant="label">{o.partnerName}</Text>
              </View>
            </View>
            <Text variant="heading">{o.title}</Text>
            <Text variant="body" style={{ color: color.ink }}>{o.body}</Text>
            {o.couponCode ? (
              <View style={styles.coupon}>
                <Text variant="caption">Code</Text>
                <Text selectable style={styles.code}>{o.couponCode}</Text>
              </View>
            ) : null}
            {o.activeTo ? <Text variant="caption">Until {new Date(o.activeTo).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text> : null}
            {o.url ? <Button compact icon="open-outline" label="Open" onPress={() => void open(o.id)} /> : null}
          </View>
        </FadeIn>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: color.indigoTint },
  card: { backgroundColor: color.white, borderRadius: radius.lg, padding: 16, gap: 8 },
  focus: { borderWidth: 2, borderColor: color.accentLight },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.accent, alignItems: "center", justifyContent: "center" },
  coupon: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1.5, borderStyle: "dashed", borderColor: color.accentLight },
  code: { fontFamily: font.bodyBold, fontSize: 16, color: color.accentText, letterSpacing: 1 },
});
