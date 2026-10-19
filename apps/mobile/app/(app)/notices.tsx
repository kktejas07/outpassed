import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { audiences, useNotices } from "../../src/features/notices/useNotices";
import { relative } from "../../src/lib/format";
import { color, radius } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Chips, Empty, ErrorNote, Loading } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn, PopIn } from "../../src/ui/motion";
import { Pill } from "../../src/ui/Pill";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

export default function Notices() {
  const vm = useNotices();
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Screen
      title="Notice board"
      eyebrow={vm.canPost ? "Hostel notices" : vm.unread ? `${vm.unread} new` : "All read"}
      back
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      right={vm.canPost ? <Button compact tone={composing ? "outline" : "accent"} icon={composing ? "close" : "add"} label={composing ? "Close" : "Post"} onPress={() => setComposing((c) => !c)} /> : undefined}
    >
      {composing ? (
        <PopIn>
          <Card style={{ gap: 12 }}>
            <Text variant="heading">New notice</Text>
            <Field label="Title" value={vm.title} onChangeText={vm.setTitle} placeholder="e.g. Mess timings from Monday" />
            <Field label="Message" value={vm.body} onChangeText={vm.setBody} multiline placeholder="What students or parents need to know" />
            <Text variant="eyebrow">Send to</Text>
            <Chips options={audiences} value={vm.audience} onChange={vm.setAudience} />
            {vm.hostelOptions.length > 1 ? <Chips options={vm.hostelOptions} value={vm.hostelId} onChange={vm.setHostelId} /> : null}
            <View style={styles.pinRow}>
              <View style={{ flex: 1 }}>
                <Text variant="label">Pin to the top</Text>
                <Text variant="caption">Stays first until you remove it.</Text>
              </View>
              <Switch value={vm.pinned} onValueChange={vm.setPinned} trackColor={{ true: color.accent, false: color.line }} thumbColor={color.white} />
            </View>
            {vm.postError ? <ErrorNote message={vm.postError} /> : null}
            <Button label="Post and notify" icon="megaphone-outline" loading={vm.posting} disabled={!vm.valid} onPress={async () => { if (await vm.post()) setComposing(false); }} />
          </Card>
        </PopIn>
      ) : null}

      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}
      {!vm.loading && vm.list.length === 0 ? <Empty icon="megaphone-outline" title="No notices yet" body={vm.canPost ? "Post mess changes, curfew updates or events. Everyone you choose gets an alert." : "Hostel announcements from your warden will appear here."} /> : null}

      {vm.list.map((n, i) => {
        const expanded = open === n.id;
        return (
          <FadeIn key={n.id} index={i}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setOpen(expanded ? null : n.id);
                void vm.markRead(n);
              }}
              style={[styles.notice, !n.read && !vm.canPost && styles.unread]}
            >
              <View style={styles.headRow}>
                {n.pinned ? <Ionicons name="pin" size={15} color={color.accentText} /> : null}
                <Text variant="heading" style={{ flex: 1 }} numberOfLines={expanded ? undefined : 1}>{n.title}</Text>
                {!n.read && !vm.canPost ? <View style={styles.dot} /> : null}
              </View>
              <Text variant="body" numberOfLines={expanded ? undefined : 2} style={{ color: color.ink }}>{n.body}</Text>
              <View style={styles.meta}>
                <Text variant="caption">{n.authorName} · {relative(n.createdAt)}</Text>
                {vm.canPost ? <Pill label={`${audiences.find((a) => a.value === n.audience)!.label}${n.hostelName ? ` · ${n.hostelName}` : ""}`} tone="indigo" /> : null}
              </View>
              {vm.canPost && n.receipts ? (
                <View style={{ gap: 6 }}>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${n.receipts.total ? Math.round((n.receipts.read / n.receipts.total) * 100) : 0}%` }]} />
                  </View>
                  <Text variant="caption">Read by {n.receipts.read} of {n.receipts.total}</Text>
                </View>
              ) : null}
              {vm.canPost && expanded ? <Button compact tone="danger" icon="trash-outline" label="Remove notice" onPress={() => void vm.remove(n)} /> : null}
            </Pressable>
          </FadeIn>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { gap: 8, padding: 16, borderRadius: radius.lg, backgroundColor: color.white, borderWidth: 1, borderColor: color.line },
  unread: { borderColor: color.accentLight, backgroundColor: color.accentSoft },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  pinRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: color.indigoTint, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: color.accent },
});
