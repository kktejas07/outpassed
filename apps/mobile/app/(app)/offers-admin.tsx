import { useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { campus, errorMessage } from "../../src/api/client";
import { useSession } from "../../src/auth/session";
import { useQuery } from "../../src/lib/useQuery";
import { color, font, radius, shadow } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Chips, Empty, ErrorNote, Loading, SectionTitle } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn, PopIn } from "../../src/ui/motion";
import { useRibbon } from "../../src/ui/Ribbon";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

/** Admins choose the sponsored listings students see. Taps are counted in total only. */
export default function OffersAdmin() {
  const { token } = useSession();
  const ribbon = useRibbon();
  const q = useQuery((t) => campus.adminOffers(t));
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState("Coding & assessments");
  const [partnerName, setPartner] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [couponCode, setCoupon] = useState("");
  const [banner, setBanner] = useState(false);
  const [occasionId, setOccasionId] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = partnerName.trim() && title.trim().length >= 3 && body.trim() && (!url || /^https?:\/\//.test(url.trim()));

  async function add() {
    if (!token || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await campus.createOffer(token, { category, partnerName: partnerName.trim(), title: title.trim(), body: body.trim(), url: url.trim() || undefined, couponCode: couponCode.trim() || undefined, showAsBanner: banner, occasionId: occasionId === "none" ? null : occasionId });
      ribbon.show({ tone: "success", title: "Offer added", body: "Adult students see it on the Campus tab." });
      setAdding(false);
      setPartner(""); setTitle(""); setBody(""); setUrl(""); setCoupon(""); setBanner(false); setOccasionId("none");
      void q.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Offers" eyebrow="Sponsored listings" back refreshing={q.refreshing} onRefresh={q.refresh} right={<Button compact icon={adding ? "close" : "add"} tone={adding ? "outline" : "accent"} label={adding ? "Close" : "Add"} onPress={() => setAdding((a) => !a)} />}>
      <Text variant="caption">Shown the same way to every student aged 18+ (never targeted, never to minors). Turn the whole section off in Settings.</Text>
      {adding ? (
        <PopIn style={[styles.form, shadow.card]}>
          <Chips options={(q.data?.categories ?? []).map((c) => ({ value: c, label: c }))} value={category} onChange={setCategory} />
          <Field label="Partner" value={partnerName} onChangeText={setPartner} placeholder="e.g. Code Spectra, a nearby training centre" />
          <Field label="Headline" value={title} onChangeText={setTitle} placeholder="e.g. Free mock placement test" />
          <Field label="Details" value={body} onChangeText={setBody} multiline placeholder="What students get and how" />
          <Field label="Link (optional)" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
          <Field label="Coupon code (optional)" value={couponCode} onChangeText={setCoupon} autoCapitalize="characters" />
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text variant="label">Show in the banner strip</Text>
              <Text variant="caption">A large slide at the top of the student home and Campus tab.</Text>
            </View>
            <Switch accessibilityLabel="Show in the banner strip" value={banner} onValueChange={setBanner} trackColor={{ true: color.indigo, false: color.line }} />
          </View>
          {q.data?.occasions.length ? (
            <>
              <Text variant="eyebrow">Part of a campus sale</Text>
              <Chips options={[{ value: "none", label: "No" }, ...q.data.occasions.map((o) => ({ value: o.id, label: o.name }))]} value={occasionId} onChange={setOccasionId} />
            </>
          ) : null}
          {error ? <ErrorNote message={error} /> : null}
          <Button icon="checkmark" label="Add offer" loading={busy} disabled={!valid} onPress={add} />
        </PopIn>
      ) : null}
      {q.loading ? <Loading rows={2} /> : null}
      {q.data && q.data.offers.length === 0 ? <Empty icon="gift-outline" title="No offers yet" /> : null}
      {q.data?.offers.length ? <SectionTitle title={`${q.data.offers.filter((o) => o.active).length} live`} /> : null}
      {q.data?.offers.map((o, i) => (
        <FadeIn key={o.id} index={i}>
          <View style={[styles.card, shadow.card, !o.active && { opacity: 0.6 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="eyebrow">{o.category} · {o.partnerName}</Text>
              <Text variant="label">{o.title}</Text>
              <Text variant="caption"><Text style={styles.clicks}>{o.clicks}</Text> taps in total</Text>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: !!o.showAsBanner }}
                onPress={async () => {
                  if (!token) return;
                  await campus.setOfferBanner(token, o.id, !o.showAsBanner).catch(() => undefined);
                  ribbon.show({ tone: "info", title: o.showAsBanner ? "Taken out of the banner strip" : "Now in the banner strip" });
                  void q.reload();
                }}
                style={[styles.bannerChip, o.showAsBanner && styles.bannerOn]}
              >
                <Ionicons name={o.showAsBanner ? "albums" : "albums-outline"} size={13} color={o.showAsBanner ? color.white : color.indigo} />
                <Text style={[styles.bannerText, o.showAsBanner && { color: color.white }]}>{o.showAsBanner ? "In banner" : "Add to banner"}</Text>
              </Pressable>
            </View>
            <Switch
              accessibilityLabel={o.active ? "Pause offer" : "Show offer"}
              value={o.active}
              onValueChange={async (v) => {
                if (!token) return;
                await campus.setOfferActive(token, o.id, v).catch(() => undefined);
                void q.reload();
              }}
              trackColor={{ true: color.indigo, false: color.line }}
            />
          </View>
        </FadeIn>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { backgroundColor: color.white, borderRadius: radius.lg, padding: 16, gap: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: color.white, borderRadius: radius.lg, padding: 14 },
  clicks: { fontFamily: font.bodyBold, color: color.ink },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bannerChip: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: color.indigoTint },
  bannerOn: { backgroundColor: color.indigo },
  bannerText: { fontFamily: font.bodyBold, fontSize: 12, color: color.indigo },
});
