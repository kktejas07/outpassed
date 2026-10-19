import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import type { TicketDto } from "../../../src/api/client";
import { useSession } from "../../../src/auth/session";
import { TICKET_ICON, TICKET_STATUS, useTicketList } from "../../../src/features/helpdesk/useHelpdesk";
import { relative } from "../../../src/lib/format";
import { color } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { ArrowCircle, Empty, ErrorNote, Loading, Segmented } from "../../../src/ui/bits";
import { FadeIn } from "../../../src/ui/motion";
import { Pill } from "../../../src/ui/Pill";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";


function TicketCard({ t, staff, index }: { t: TicketDto; staff: boolean; index: number }) {
  const s = TICKET_STATUS[t.status];
  return (
    <FadeIn index={index}>
      <Card onPress={() => router.push(`/helpdesk/${t.id}`)} style={{ gap: 10 }}>
        <View style={styles.row}>
          <View style={styles.icon}><Ionicons name={TICKET_ICON[t.category] ?? "help-circle"} size={19} color={color.indigo} /></View>
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={1}>{t.title}</Text>
            <Text variant="caption" numberOfLines={1}>
              #{t.number} · {t.category}{staff ? ` · ${t.student.name}` : ""}{t.location ? ` · ${t.location}` : ""}
            </Text>
          </View>
          <Pill label={s.label} tone={s.tone} />
        </View>
        <View style={styles.row}>
          <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
            {t.assignedTo ? `${t.assignedTo.name} · ` : ""}updated {relative(t.updatedAt)}{t.updates ? ` · ${t.updates} update${t.updates === 1 ? "" : "s"}` : ""}
          </Text>
          <ArrowCircle size={30} />
        </View>
      </Card>
    </FadeIn>
  );
}

/** The hostel helpdesk: students see their requests; wardens see their hostels'. */
export default function Helpdesk() {
  const { user } = useSession();
  const vm = useTicketList();
  const staff = user?.role === "WARDEN" || user?.role === "ADMIN";
  const waiting = (vm.counts?.OPEN ?? 0) + (vm.counts?.IN_PROGRESS ?? 0);
  return (
    <Screen
      title="Helpdesk"
      eyebrow={staff ? "Hostel requests" : "Report a problem"}
      back
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      right={user?.role === "STUDENT" ? <Button compact icon="add" label="Report" onPress={() => router.push("/helpdesk/new")} /> : undefined}
    >
      {staff && vm.counts ? (
        <Text variant="caption">{waiting ? `${waiting} request${waiting === 1 ? "" : "s"} to look at: ${vm.counts.OPEN} new, ${vm.counts.IN_PROGRESS} being fixed.` : "Nothing waiting. New requests from your hostels show up here."}</Text>
      ) : null}
      <Segmented options={[{ value: "ACTIVE", label: "Open" }, { value: "ALL", label: "All" }]} value={vm.tab} onChange={vm.setTab} />
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading rows={3} /> : null}
      {!vm.loading && vm.tickets.length === 0 ? (
        <Empty icon="construct-outline" title={staff ? "No open requests" : "Nothing reported"} body={staff ? undefined : "No water, Wi-Fi down, a broken fan? Report it and the warden will pick it up."} />
      ) : null}
      {vm.tickets.map((t, i) => <TicketCard key={t.id} t={t} staff={staff} index={i} />)}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.indigoTint, alignItems: "center", justifyContent: "center" },
});
