import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { campus, errorMessage, type OccasionDto } from "../../src/api/client";
import { useSession } from "../../src/auth/session";
import { BANNER_THEMES, themeOf } from "../../src/components/BannerCarousel";
import { useQuery } from "../../src/lib/useQuery";
import { color, font, radius, shadow } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Chips, Empty, ErrorNote, Loading, SectionTitle } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn, PopIn, PressScale } from "../../src/ui/motion";
import { useRibbon } from "../../src/ui/Ribbon";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

const DAY = 86_400_000;
const ICONS = ["sparkles", "flame", "gift", "book", "school", "home", "musical-notes", "trophy", "rocket", "heart", "cart", "sunny"] as const;
const starts = [
  { value: "0", label: "Today" },
  { value: "1", label: "Tomorrow" },
  { value: "7", label: "In a week" },
];
const lengths = [
  { value: "3", label: "3 days" },
  { value: "7", label: "1 week" },
  { value: "14", label: "2 weeks" },
  { value: "30", label: "1 month" },
];
const short = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** A small version of the banner, so the admin sees what students will see. */
function Preview({ name, tagline, theme, icon }: { name: string; tagline: string; theme: string; icon: string }) {
  const t = themeOf(theme);
  return (
    <View style={[styles.preview, { backgroundColor: t.bg }]}>
      <View style={[styles.ring, { borderColor: t.ring }]} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[styles.pEyebrow, { color: t.sub }]}>Campus sale</Text>
        <Text style={styles.pTitle} numberOfLines={2}>{name || "Name of the sale"}</Text>
        <Text style={[styles.pSub, { color: t.sub }]} numberOfLines={2}>{tagline || "One line on what students will find"}</Text>
      </View>
      <View style={styles.pIcon}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={26} color="#FFFFFF" />
      </View>
    </View>
  );
}

function NewOccasion({ onDone }: { onDone: () => void }) {
  const { token } = useSession();
  const ribbon = useRibbon();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [theme, setTheme] = useState("saffron");
  const [icon, setIcon] = useState<string>("sparkles");
  const [start, setStart] = useState("0");
  const [length, setLength] = useState("7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length >= 3 && tagline.trim().length >= 3;

  async function save() {
    if (!token || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const from = new Date();
      if (start !== "0") {
        from.setTime(from.getTime() + Number(start) * DAY);
        from.setHours(0, 0, 0, 0);
      }
      const to = new Date(from.getTime() + Number(length) * DAY);
      to.setHours(23, 59, 0, 0);
      await campus.createOccasion(token, { name: name.trim(), tagline: tagline.trim(), theme, icon, startsAt: from.toISOString(), endsAt: to.toISOString() });
      ribbon.show({
        tone: "success",
        title: start === "0" ? `${name.trim()} is live` : `${name.trim()} is scheduled`,
        body: start === "0" ? "Students see the banner now and got an alert." : "The banner appears on its first day.",
        celebrate: start === "0",
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the sale"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PopIn style={[styles.form, shadow.card]}>
      <Preview name={name} tagline={tagline} theme={theme} icon={icon} />
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Diwali Dhamaka, Exam season essentials" />
      <Field label="One line for the banner" value={tagline} onChangeText={setTagline} placeholder="e.g. Lights, sweets and gifts near campus" />
      <Text variant="eyebrow">Colour</Text>
      <View style={styles.swatches}>
        {Object.entries(BANNER_THEMES).map(([key, t]) => (
          <Pressable key={key} accessibilityRole="radio" accessibilityState={{ selected: theme === key }} accessibilityLabel={key} onPress={() => setTheme(key)} style={[styles.swatch, { backgroundColor: t.bg }, theme === key && styles.swatchOn]}>
            {theme === key ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
          </Pressable>
        ))}
      </View>
      <Text variant="eyebrow">Icon</Text>
      <View style={styles.icons}>
        {ICONS.map((i) => (
          <Pressable key={i} accessibilityRole="radio" accessibilityState={{ selected: icon === i }} accessibilityLabel={i} onPress={() => setIcon(i)} style={[styles.iconBtn, icon === i && { backgroundColor: color.indigo }]}>
            <Ionicons name={i} size={20} color={icon === i ? color.white : color.indigo} />
          </Pressable>
        ))}
      </View>
      <Text variant="eyebrow">Starts</Text>
      <Chips options={starts} value={start} onChange={setStart} />
      <Text variant="eyebrow">Runs for</Text>
      <Chips options={lengths} value={length} onChange={setLength} />
      {error ? <ErrorNote message={error} /> : null}
      <Button icon="sparkles" label={start === "0" ? "Start the sale" : "Schedule it"} loading={busy} disabled={!valid} onPress={save} />
    </PopIn>
  );
}

function Row({ o, onChanged }: { o: OccasionDto & { offers: number; items: number }; onChanged: () => void }) {
  const { token } = useSession();
  const ribbon = useRibbon();
  const t = themeOf(o.theme);
  const ended = new Date(o.endsAt).getTime() < Date.now() || !o.active;
  return (
    <PressScale onPress={() => router.push(`/occasions/${o.id}`)} accessibilityRole="button" style={[styles.row, shadow.card, ended && { opacity: 0.6 }]}>
      <View style={[styles.rowIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={o.icon as keyof typeof Ionicons.glyphMap} size={20} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{o.name}</Text>
        <Text variant="caption" numberOfLines={1}>{short(o.startsAt)} – {short(o.endsAt)} · {o.items} listing{o.items === 1 ? "" : "s"} · {o.offers} offer{o.offers === 1 ? "" : "s"}</Text>
      </View>
      {o.live ? (
        <Button
          compact
          tone="outline"
          label="End now"
          onPress={async () => {
            if (!token) return;
            await campus.updateOccasion(token, o.id, { active: false }).catch(() => undefined);
            ribbon.show({ tone: "info", title: `${o.name} ended`, body: "Its banner is gone; listings stay in Buy & sell." });
            onChanged();
          }}
        />
      ) : null}
    </PressScale>
  );
}

/** Sales and seasons: Diwali, exam season, freshers' move-in. Each gets a banner and its own page. */
export default function OccasionsAdmin() {
  const q = useQuery((t) => campus.adminOccasions(t));
  const [adding, setAdding] = useState(false);
  const all = q.data?.occasions ?? [];
  const now = Date.now();
  const live = all.filter((o) => o.live);
  const upcoming = all.filter((o) => o.active && new Date(o.startsAt).getTime() > now);
  const past = all.filter((o) => !o.live && !upcoming.includes(o));

  return (
    <Screen
      title="Sales & seasons"
      eyebrow="Campus marketplace"
      back
      refreshing={q.refreshing}
      onRefresh={q.refresh}
      right={<Button compact icon={adding ? "close" : "add"} tone={adding ? "outline" : "accent"} label={adding ? "Close" : "New"} onPress={() => setAdding((a) => !a)} />}
    >
      <Text variant="caption">
        A sale gets its own banner and page. Students can list items for it, and you can tag offers to it in Offers. Students under 18 see the student listings but not the sponsored offers.
      </Text>
      {adding ? <NewOccasion onDone={() => { setAdding(false); void q.reload(); }} /> : null}
      {q.error ? <ErrorNote message={q.error} onRetry={q.refresh} /> : null}
      {q.loading ? <Loading rows={2} /> : null}
      {q.data && all.length === 0 && !adding ? <Empty icon="sparkles-outline" title="No sales yet" body="Start one for Diwali, exam season or freshers' move-in." /> : null}
      {[
        { title: "Running now", rows: live },
        { title: "Coming up", rows: upcoming },
        { title: "Finished", rows: past },
      ].map((g) =>
        g.rows.length ? (
          <View key={g.title} style={{ gap: 10 }}>
            <SectionTitle title={g.title} />
            {g.rows.map((o, i) => (
              <FadeIn key={o.id} index={i}>
                <Row o={o} onChanged={() => void q.reload()} />
              </FadeIn>
            ))}
          </View>
        ) : null,
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { backgroundColor: color.white, borderRadius: radius.lg, padding: 16, gap: 12 },
  preview: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, padding: 16, overflow: "hidden" },
  ring: { position: "absolute", width: 150, height: 150, right: -50, top: -60, borderRadius: 999, borderWidth: 16, opacity: 0.35 },
  pEyebrow: { fontFamily: font.bodyBold, fontSize: 10.5, letterSpacing: 0.8 },
  pTitle: { fontFamily: font.display, fontSize: 17, color: "#FFFFFF" },
  pSub: { fontFamily: font.body, fontSize: 12.5 },
  pIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  swatches: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 3, borderColor: color.white, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  icons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconBtn: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: color.indigoTint },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: color.white, borderRadius: radius.lg, padding: 14 },
  rowIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
