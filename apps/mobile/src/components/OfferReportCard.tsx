import { useState } from "react";
import { Platform, Share, StyleSheet, View } from "react-native";
import { campus, type OfferReport } from "../api/client";
import { useQuery } from "../lib/useQuery";
import { color, font, radius, shadow } from "../theme/tokens";
import { Button } from "../ui/Button";
import { Chips, ErrorNote, Loading } from "../ui/bits";
import { CountUp } from "../ui/motion";
import { Text } from "../ui/Text";

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthName = (k: string) => new Date(`${k}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

/** CSV a sponsor can open in Excel: one row per offer, one column per day. */
function toCsv(r: OfferReport) {
  const days = Array.from({ length: r.daysInMonth }, (_, i) => `${r.month}-${String(i + 1).padStart(2, "0")}`);
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ["Partner", "Offer", "Category", "Total taps", ...days];
  const rows = r.offers.map((o) => [o.partnerName, o.title, o.category, String(o.taps), ...days.map((d) => String(o.days[d] ?? 0))]);
  return [head, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}

async function shareCsv(r: OfferReport) {
  const csv = toCsv(r);
  const name = `outpass-offers-${r.month}.csv`;
  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv" });
    const a = (globalThis as unknown as { document: { createElement: (t: string) => { href: string; download: string; click: () => void } } }).document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    return;
  }
  await Share.share({ title: name, message: csv });
}

/** Admins: taps per sponsored offer for a month, to send to partners. Totals only. */
export function OfferReportCard() {
  const now = new Date();
  const months = [monthKey(now), monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)), monthKey(new Date(now.getFullYear(), now.getMonth() - 2, 1))];
  const [month, setMonth] = useState(months[0]!);
  const q = useQuery((t) => campus.offerReport(t, month), [month]);
  const r = q.data;
  const top = Math.max(1, ...(r?.offers.map((o) => o.taps) ?? [1]));

  return (
    <View style={[styles.card, shadow.card]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Monthly report</Text>
          <Text variant="caption">Taps per offer, to share with partners. Totals only: nobody's name is recorded.</Text>
        </View>
      </View>
      <Chips options={months.map((m) => ({ value: m, label: monthName(m) }))} value={month} onChange={setMonth} />
      {q.error ? <ErrorNote message={q.error} onRetry={q.refresh} /> : null}
      {q.loading ? <Loading rows={1} /> : null}
      {r ? (
        <>
          <View style={styles.total}>
            <CountUp value={r.total} style={styles.totalN} />
            <Text variant="caption">taps in {monthName(r.month)}</Text>
          </View>
          {r.offers.length === 0 ? <Text variant="caption">No taps yet this month.</Text> : null}
          {r.offers.map((o) => (
            <View key={o.id} style={{ gap: 4 }}>
              <View style={styles.rowTop}>
                <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>{o.partnerName} · {o.title}</Text>
                <Text style={styles.taps}>{o.taps}</Text>
              </View>
              <View style={styles.track}><View style={[styles.bar, { width: `${(o.taps / top) * 100}%` }]} /></View>
            </View>
          ))}
          {r.offers.length ? <Button compact tone="outline" icon="download-outline" label={Platform.OS === "web" ? "Download CSV" : "Share CSV"} onPress={() => void shareCsv(r)} /> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.white, borderRadius: radius.lg, padding: 16, gap: 12 },
  head: { flexDirection: "row", gap: 12 },
  title: { fontFamily: font.display, fontSize: 17, color: color.ink },
  total: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  totalN: { fontFamily: font.display, fontSize: 28, color: color.indigo },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  taps: { fontFamily: font.bodyBold, fontSize: 14, color: color.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: color.indigoTint, overflow: "hidden" },
  bar: { height: 8, borderRadius: 4, backgroundColor: color.indigo },
});
