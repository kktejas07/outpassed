import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ops, type AuditEntry } from "../../src/api/client";
import { useSession } from "../../src/auth/session";
import { when } from "../../src/lib/format";
import { useQuery } from "../../src/lib/useQuery";
import { color, radius, shadow } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Empty, ErrorNote, Loading } from "../../src/ui/bits";
import { FadeIn } from "../../src/ui/motion";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

const ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: string }> = {
  OUTPASS_APPROVED: { icon: "checkmark-circle", tone: color.green },
  OUTPASS_REJECTED: { icon: "close-circle", tone: color.red },
  OUTPASS_OVERRIDE: { icon: "flash", tone: color.amber },
  EXTENSION_APPROVED: { icon: "time", tone: color.green },
  EXTENSION_REJECTED: { icon: "time", tone: color.red },
  ROLLCALL_CLOSED: { icon: "moon", tone: color.indigo },
  ROLLCALL_CORRECTED: { icon: "create", tone: color.amber },
  SOS_ACKNOWLEDGED: { icon: "alert-circle", tone: color.red },
  SOS_RESOLVED: { icon: "shield-checkmark", tone: color.green },
  REPORT_EXPORTED: { icon: "download", tone: color.indigo },
};
const fallback = { icon: "ellipse" as const, tone: color.muted };

const day = (iso: string | number) => new Date(iso).toDateString();
const dayLabel = (iso: string) =>
  day(iso) === day(Date.now()) ? "Today" : day(iso) === day(Date.now() - 86_400_000) ? "Yesterday" : new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** Who did what: approvals, overrides, roll calls and admin changes. */
export default function Activity() {
  const { token } = useSession();
  const q = useQuery((t) => ops.audit(t));
  const [more, setMore] = useState<AuditEntry[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ended, setEnded] = useState(false);
  const entries = [...(q.data ?? []), ...more];

  async function loadMore() {
    const last = entries[entries.length - 1];
    if (!token || !last) return;
    setLoadingMore(true);
    try {
      const next = await ops.audit(token, last.createdAt);
      setMore((m) => [...m, ...next]);
      if (next.length < 50) setEnded(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Screen title="Activity log" eyebrow="Admin" back refreshing={q.refreshing} onRefresh={() => { setMore([]); setEnded(false); void q.refresh(); }}>
      {q.error ? <ErrorNote message={q.error} onRetry={q.refresh} /> : null}
      {q.loading ? <Loading /> : null}
      {!q.loading && entries.length === 0 ? <Empty icon="list-outline" title="Nothing yet" body="Approvals, overrides, roll calls and account changes will be listed here." /> : null}
      {entries.map((e, i) => {
        const m = ICON[e.action] ?? fallback;
        const newDay = i === 0 || day(e.createdAt) !== day(entries[i - 1]!.createdAt);
        return (
          <FadeIn key={e.id} index={Math.min(i, 8)} style={{ gap: 8 }}>
            {newDay ? <Text variant="eyebrow" style={{ marginTop: i ? 8 : 0 }}>{dayLabel(e.createdAt)}</Text> : null}
            <View style={[styles.row, shadow.card]}>
              <View style={[styles.icon, { backgroundColor: `${m.tone}1A` }]}>
                <Ionicons name={m.icon} size={18} color={m.tone} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">{e.summary}</Text>
                <Text variant="caption">{e.actorName} · {e.actorRole.toLowerCase()} · {when(e.createdAt)}</Text>
              </View>
            </View>
          </FadeIn>
        );
      })}
      {entries.length >= 50 && !ended ? <Button tone="ghost" label="Show older" loading={loadingMore} onPress={() => void loadMore()} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 14, borderRadius: radius.lg, backgroundColor: color.white },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
