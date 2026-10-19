import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { api, errorMessage, ops, type ReportType } from "../../src/api/client";
import { useSession } from "../../src/auth/session";
import { useQuery } from "../../src/lib/useQuery";
import { color, font, radius, shadow } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Chips, ErrorNote, Loading, SectionTitle } from "../../src/ui/bits";
import { FadeIn } from "../../src/ui/motion";
import { useRibbon } from "../../src/ui/Ribbon";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000));

const ranges = [
  { value: "today", label: "Today", from: () => daysAgo(0) },
  { value: "7", label: "Last 7 days", from: () => daysAgo(6) },
  { value: "30", label: "Last 30 days", from: () => daysAgo(29) },
  { value: "month", label: "This month", from: () => ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) },
] as const;

const downloads: { type: ReportType; label: string; body: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: "movements", label: "Gate movements", body: "Every scan in and out, with the guard and gate", icon: "swap-horizontal" },
  { type: "late", label: "Late returns", body: "Who came back late, and by how long", icon: "time-outline" },
  { type: "visitors", label: "Visitors", body: "Who visited whom, when they arrived and left", icon: "people-outline" },
  { type: "absences", label: "Roll-call absences", body: "Students missing at night roll call", icon: "clipboard-outline" },
];

function Tile({ value, label, tone = color.ink, sub }: { value: number; label: string; tone?: string; sub?: string }) {
  return (
    <View style={[styles.tile, shadow.card]}>
      <Text style={[styles.tileN, { color: tone }]}>{value}</Text>
      <Text variant="label" numberOfLines={2}>{label}</Text>
      {sub ? <Text variant="caption" numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

/** Numbers for the principal or warden, and CSV downloads for records. */
export default function Reports() {
  const { token, user } = useSession();
  const ribbon = useRibbon();
  const [range, setRange] = useState<(typeof ranges)[number]["value"]>("7");
  const [hostelId, setHostelId] = useState("");
  const [hostels, setHostels] = useState<{ value: string; label: string }[]>([]);
  const [downloading, setDownloading] = useState<ReportType | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const from = ranges.find((r) => r.value === range)!.from();
  const to = daysAgo(0);

  useEffect(() => {
    if (!token) return;
    api
      .adminHostels(token)
      .then((all) => {
        const mine = user?.role === "WARDEN" ? all.filter((h) => h.wardens.some((w) => w.id === user.id)) : [];
        const list = (mine.length ? mine : all).map((h) => ({ value: h.id, label: h.name }));
        setHostels(list.length > 1 ? [{ value: "", label: mine.length ? "My hostels" : "All hostels" }, ...list] : []);
      })
      .catch(() => setHostels([]));
  }, [token, user?.id, user?.role]);

  const q = useQuery((t) => ops.reportSummary(t, from, to, hostelId || undefined), [from, to, hostelId]);
  const s = q.data;

  async function download(type: ReportType) {
    if (!token) return;
    setDlError(null);
    setDownloading(type);
    try {
      const url = await ops.reportLink(token, type, from, to, hostelId || undefined);
      if (Platform.OS === "web") globalThis.open?.(url, "_blank");
      else await Linking.openURL(url);
      ribbon.show({ tone: "success", title: "Download started", body: "A spreadsheet (CSV) that opens in Excel or Google Sheets." });
    } catch (err) {
      setDlError(errorMessage(err, "Couldn't start the download"));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Screen title="Reports" eyebrow={hostelId ? hostels.find((h) => h.value === hostelId)?.label ?? "Campus" : "Campus"} back refreshing={q.refreshing} onRefresh={q.refresh}>
      <Chips options={ranges.map((r) => ({ value: r.value, label: r.label }))} value={range} onChange={setRange} />
      {hostels.length ? <Chips options={hostels} value={hostelId} onChange={setHostelId} /> : null}
      {q.error ? <ErrorNote message={q.error} onRetry={q.refresh} /> : null}
      {q.loading ? <Loading /> : null}
      {s ? (
        <FadeIn style={{ gap: 12 }}>
          <View style={styles.grid}>
            <Tile value={s.outpasses.requested} label="Outpasses asked for" sub={`${s.outpasses.approved} approved · ${s.outpasses.rejected} rejected`} tone={color.indigo} />
            <Tile value={s.movements.exits} label="Went out" sub={`${s.movements.returns} came back`} />
            <Tile value={s.lateReturns} label="Late returns" tone={s.lateReturns ? color.amber : color.ink} sub={s.overdueNow ? `${s.overdueNow} still out late now` : undefined} />
            <Tile value={s.rollCallAbsences} label="Absent at roll call" tone={s.rollCallAbsences ? color.red : color.ink} />
            <Tile value={s.visitors} label="Visitors came in" />
            <Tile value={s.parcels} label="Parcels" sub={s.sos ? `${s.sos} SOS alerts` : undefined} />
          </View>
          {s.repeatLate.length ? (
            <>
              <SectionTitle title="Often late" />
              <View style={[styles.list, shadow.card]}>
                {s.repeatLate.map((r, i) => (
                  <View key={r.id} style={[styles.lateRow, i > 0 && styles.divider]}>
                    <View style={{ flex: 1 }}>
                      <Text variant="label">{r.name}</Text>
                      {r.rollNo ? <Text variant="caption">{r.rollNo}</Text> : null}
                    </View>
                    <Text style={styles.lateN}>{r.count}×</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </FadeIn>
      ) : null}
      <SectionTitle title="Download" />
      {dlError ? <ErrorNote message={dlError} /> : null}
      <View style={[styles.list, shadow.card]}>
        {downloads.map((d, i) => (
          <View key={d.type} style={[styles.dl, i > 0 && styles.divider]}>
            <View style={styles.dlIcon}><Ionicons name={d.icon} size={20} color={color.white} /></View>
            <View style={{ flex: 1 }}>
              <Text variant="label">{d.label}</Text>
              <Text variant="caption" numberOfLines={2}>{d.body}</Text>
            </View>
            <Button compact tone="outline" icon="download-outline" label="CSV" loading={downloading === d.type} onPress={() => void download(d.type)} />
          </View>
        ))}
      </View>
      <Text variant="caption" style={{ textAlign: "center" }}>{from === to ? `For ${from}` : `${from} to ${to}`} · download links work for 10 minutes</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48.5%", flexGrow: 1, backgroundColor: color.white, borderRadius: radius.lg, padding: 14, gap: 2 },
  tileN: { fontFamily: font.display, fontSize: 28 },
  list: { backgroundColor: color.white, borderRadius: radius.lg, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: color.line },
  lateRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  lateN: { fontFamily: font.display, fontSize: 18, color: color.amber },
  dl: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  dlIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: color.indigo, alignItems: "center", justifyContent: "center" },
});
