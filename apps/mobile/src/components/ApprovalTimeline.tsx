import Ionicons from "@expo/vector-icons/Ionicons";
import type { OutpassDto } from "@outpassed/shared";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { when } from "../lib/format";
import { color } from "../theme/tokens";
import { Text } from "../ui/Text";

type StepState = "done" | "current" | "todo" | "failed" | "skipped";
type Step = { title: string; detail: string; state: StepState };

/** Builds the steps a pass goes through, from its status and approvals. */
export function timelineSteps(o: OutpassDto): Step[] {
  const parent = o.approvals.find((a) => a.step === "PARENT");
  const warden = o.approvals.find((a) => a.step === "WARDEN");
  const rejectedBy = o.approvals.find((a) => a.decision === "REJECT");
  const parentSkipped = !parent && o.status !== "PENDING_PARENT" && !(o.status === "CANCELLED" && !warden);

  const steps: Step[] = [{ title: "Requested", detail: when(o.createdAt), state: "done" }];

  if (parent?.override) {
    steps.push({
      title: parent.decision === "APPROVE" ? "Approved by warden (override)" : "Rejected by warden",
      detail: `${parent.approverName} · ${parent.reason ?? ""}`.trim(),
      state: parent.decision === "APPROVE" ? "done" : "failed",
    });
  } else {
    steps.push({
      title: parent ? (parent.decision === "APPROVE" ? "Parent approved" : "Parent rejected") : parentSkipped ? "Parent notified" : "Parent approval",
      detail: parent ? `${parent.approverName} · ${when(parent.createdAt)}` : parentSkipped ? "Not required for this pass" : "Waiting for a response",
      state: parent ? (parent.decision === "APPROVE" ? "done" : "failed") : parentSkipped ? "skipped" : o.status === "PENDING_PARENT" ? "current" : "todo",
    });
    steps.push({
      title: warden ? (warden.decision === "APPROVE" ? "Warden approved" : "Warden rejected") : "Warden approval",
      detail: warden ? `${warden.approverName} · ${when(warden.createdAt)}` : o.status === "PENDING_WARDEN" ? "Waiting for the warden" : "After the parent",
      state: warden ? (warden.decision === "APPROVE" ? "done" : "failed") : o.status === "PENDING_WARDEN" ? "current" : "todo",
    });
  }

  if (rejectedBy || o.status === "CANCELLED") {
    if (o.status === "CANCELLED") steps.push({ title: "Cancelled", detail: "Cancelled by the student", state: "failed" });
    return steps;
  }

  steps.push({
    title: o.exitedAt ? "Left campus" : "Exit at gate",
    detail: o.exitedAt ? when(o.exitedAt) : `From ${when(o.leaveAt)}`,
    state: o.exitedAt ? "done" : o.status === "APPROVED" ? "current" : "todo",
  });
  steps.push({
    title: o.returnedAt ? "Back on campus" : o.overdue ? "Overdue" : "Return",
    detail: o.returnedAt ? when(o.returnedAt) : `By ${when(o.returnBy)}`,
    state: o.returnedAt ? "done" : o.overdue ? "failed" : o.status === "OUT" ? "current" : "todo",
  });
  return steps;
}

function Dot({ state }: { state: StepState }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state !== "current") return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  const map = {
    done: { bg: color.greenBright, icon: "checkmark" as const },
    current: { bg: color.accent, icon: null },
    todo: { bg: color.line, icon: null },
    failed: { bg: color.red, icon: "close" as const },
    skipped: { bg: color.faint, icon: "remove" as const },
  }[state];

  return (
    <View style={styles.dotWrap}>
      {state === "current" ? (
        <Animated.View
          style={[
            styles.halo,
            { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }] },
          ]}
        />
      ) : null}
      <View style={[styles.dot, { backgroundColor: map.bg }]}>
        {map.icon ? <Ionicons name={map.icon} size={12} color={color.white} /> : state === "current" ? <View style={styles.inner} /> : null}
      </View>
    </View>
  );
}

export function ApprovalTimeline({ outpass }: { outpass: OutpassDto }) {
  const steps = timelineSteps(outpass);
  return (
    <View>
      {steps.map((s, i) => (
        <View key={s.title + i} style={styles.row}>
          <View style={styles.rail}>
            <Dot state={s.state} />
            {i < steps.length - 1 ? <View style={[styles.line, s.state === "done" && { backgroundColor: color.greenBright }]} /> : null}
          </View>
          <View style={styles.text}>
            <Text variant="label" style={s.state === "todo" ? { color: color.muted } : s.state === "failed" ? { color: color.red } : null}>{s.title}</Text>
            <Text variant="caption" numberOfLines={2}>{s.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  rail: { alignItems: "center", width: 22 },
  dotWrap: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: color.accent },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  inner: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.white },
  line: { flex: 1, width: 2, minHeight: 22, backgroundColor: color.line, marginVertical: 2 },
  text: { flex: 1, paddingBottom: 16, gap: 2 },
});
