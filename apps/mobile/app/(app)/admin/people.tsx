import type { UserDto } from "@outpassed/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAddStaff, useLinkGuardian, usePeople } from "../../../src/features/admin/useAdmin";
import { color } from "../../../src/theme/tokens";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Avatar, Chips, Empty, ErrorNote, Loading } from "../../../src/ui/bits";
import { Field } from "../../../src/ui/Field";
import { FadeIn, PopIn } from "../../../src/ui/motion";
import { Pill } from "../../../src/ui/Pill";
import { Screen } from "../../../src/ui/Screen";
import { Text } from "../../../src/ui/Text";

const roleFilters = [
  { value: "ALL", label: "Everyone" },
  { value: "STUDENT", label: "Students" },
  { value: "PARENT", label: "Parents" },
  { value: "WARDEN", label: "Wardens" },
  { value: "GUARD", label: "Guards" },
  { value: "ADMIN", label: "Admins" },
] as const;

function AddStaff({ onDone }: { onDone: () => void }) {
  const f = useAddStaff(onDone);
  return (
    <PopIn>
      <Card style={{ gap: 12, borderColor: color.goldLight }}>
        <Text variant="heading">Add staff account</Text>
        <Chips
          options={[
            { value: "GUARD", label: "Guard" },
            { value: "WARDEN", label: "Warden" },
            { value: "ADMIN", label: "Admin" },
          ]}
          value={f.role}
          onChange={f.setRole}
        />
        <Field label="Name" value={f.name} onChangeText={f.setName} placeholder="Full name" />
        <Field label="Email" value={f.email} onChangeText={f.setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@college.edu" />
        <Field label="Temporary password" value={f.password} onChangeText={f.setPassword} secureTextEntry placeholder="At least 8 characters" />
        {f.error ? <ErrorNote message={f.error} /> : null}
        <Button label="Create account" loading={f.submitting} disabled={!f.valid} onPress={f.submit} />
      </Card>
    </PopIn>
  );
}

function LinkParent({ student, onDone }: { student: UserDto; onDone: () => void }) {
  const f = useLinkGuardian(student.id, onDone);
  return (
    <View style={{ gap: 10, marginTop: 10 }}>
      <Field label="Parent's email" value={f.parentEmail} onChangeText={f.setParentEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Parent must have an Arvio account" />
      <Field label="Relation" value={f.relation} onChangeText={f.setRelation} />
      {f.error ? <ErrorNote message={f.error} /> : null}
      <Button compact label="Link parent" loading={f.submitting} onPress={f.submit} />
    </View>
  );
}

export default function People() {
  const vm = usePeople();
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <Screen
      title="People"
      eyebrow="Accounts"
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      right={<Button compact tone={adding ? "outline" : "gold"} icon={adding ? "close" : "add"} label={adding ? "Close" : "Staff"} onPress={() => setAdding((a) => !a)} />}
    >
      {adding ? <AddStaff onDone={() => { setAdding(false); setNotice("Staff account created"); void vm.reload(); }} /> : null}
      {notice ? (
        <PopIn>
          <View style={styles.notice}><Text variant="label" style={{ color: color.green }}>{notice}</Text></View>
        </PopIn>
      ) : null}
      <Chips options={roleFilters.map((r) => ({ value: r.value, label: r.label }))} value={vm.role} onChange={vm.setRole} />
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}
      {!vm.loading && vm.users.length === 0 ? <Empty icon="id-card-outline" title="No accounts" /> : null}
      {vm.users.map((u, i) => (
        <FadeIn key={u.id} index={i}>
          <Card>
            <View style={styles.row}>
              <Avatar name={u.name} size={38} tone={u.role === "STUDENT" ? "gold" : "indigo"} />
              <View style={{ flex: 1 }}>
                <Text variant="label">{u.name}</Text>
                <Text variant="caption" numberOfLines={1}>{u.student?.rollNo ? `${u.student.rollNo} · ` : ""}{u.email}</Text>
              </View>
              <Pill label={u.role.toLowerCase()} tone={u.role === "STUDENT" ? "gold" : "indigo"} />
            </View>
            {u.role === "STUDENT" ? (
              linking === u.id ? (
                <LinkParent student={u} onDone={() => { setLinking(null); setNotice(`Parent linked to ${u.name}`); }} />
              ) : (
                <Button compact tone="ghost" label="Link a parent" style={{ alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 0 }} onPress={() => setLinking(u.id)} />
              )
            ) : null}
          </Card>
        </FadeIn>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  notice: { padding: 12, borderRadius: 14, backgroundColor: color.greenSoft },
});
