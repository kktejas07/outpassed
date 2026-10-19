import { Switch, StyleSheet, View } from "react-native";
import { useState } from "react";
import { campus, errorMessage, type CampusSettings } from "../../src/api/client";
import { useSession } from "../../src/auth/session";
import { useQuery } from "../../src/lib/useQuery";
import { color, radius, shadow } from "../../src/theme/tokens";
import { Chips, ErrorNote, Loading } from "../../src/ui/bits";
import { FadeIn } from "../../src/ui/motion";
import { useRibbon } from "../../src/ui/Ribbon";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

type Flag = "requireGatePhoto" | "offersEnabled" | "schoolMode";
const keepFor = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "6 months" },
  { value: "365", label: "1 year" },
];

const rows: { key: Flag; title: string; body: string }[] = [
  { key: "requireGatePhoto", title: "Photo at every exit and entry", body: "Guards must photograph each student and visitor at the gate. They can skip it if the camera fails; skips are logged." },
  { key: "offersEnabled", title: "Offers & opportunities", body: "Show sponsored listings (courses, mock tests, food near campus, coupons) to students aged 18+. Everyone sees the same list." },
  { key: "schoolMode", title: "School campus", body: "For schools: hides offers and the buy & sell marketplace, and asks a parent's permission before keeping any student's photo." },
];

export default function Settings() {
  const { token } = useSession();
  const ribbon = useRibbon();
  const q = useQuery((t) => campus.settings(t));
  const [error, setError] = useState<string | null>(null);
  const s = q.data;

  async function save(change: Partial<Omit<CampusSettings, "institutionName">>, done = "Saved") {
    if (!token || !s) return;
    q.setData({ ...s, ...change });
    setError(null);
    try {
      q.setData(await campus.updateSettings(token, change));
      ribbon.show({ tone: "success", title: done });
    } catch (err) {
      q.setData(s);
      setError(errorMessage(err));
    }
  }

  return (
    <Screen title="Settings" eyebrow={s?.institutionName ?? "College"} back>
      {q.loading ? <Loading rows={2} /> : null}
      {error ? <ErrorNote message={error} /> : null}
      {s
        ? rows.map((r, i) => (
            <FadeIn key={r.key} index={i}>
              <View style={[styles.row, shadow.card]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="label">{r.title}</Text>
                  <Text variant="caption">{r.body}</Text>
                </View>
                <Switch accessibilityLabel={r.title} value={s[r.key]} onValueChange={(v) => void save({ [r.key]: v })} trackColor={{ true: color.indigo, false: color.line }} />
              </View>
            </FadeIn>
          ))
        : null}
      {s ? (
        <FadeIn index={rows.length}>
          <View style={[styles.block, shadow.card]}>
            <Text variant="label">Keep gate photos for</Text>
            <Text variant="caption">
              Exit, entry and visitor photos are deleted after this; the movement log itself stays. Shorter is better for privacy. Students under 18 are only photographed once a parent agrees.
            </Text>
            <Chips
              options={keepFor}
              value={String(s.photoRetentionDays)}
              onChange={(v) => void save({ photoRetentionDays: Number(v) }, Number(v) < s.photoRetentionDays ? "Saved: older photos deleted" : "Saved")}
            />
          </View>
        </FadeIn>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: color.white },
  block: { gap: 8, padding: 16, borderRadius: radius.lg, backgroundColor: color.white },
});
