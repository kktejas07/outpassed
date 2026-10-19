import type { UserDto } from "@outpassed/shared";
import { router } from "expo-router";
import { useState } from "react";
import { api, campus, errorMessage } from "../../../src/api/client";
import { useQuery } from "../../../src/lib/useQuery";
import { QuickActions } from "../../../src/ui/QuickActions";
import { useSession } from "../../../src/auth/session";
import { pickPhoto } from "../../../src/features/photo/pickPhoto";
import { useRibbon } from "../../../src/ui/Ribbon";
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
  { value: "FACULTY", label: "Faculty" },
  { value: "GUARD", label: "Guards" },
  { value: "ADMIN", label: "Admins" },
] as const;

function AddStaff({ onDone }: { onDone: () => void }) {
  const f = useAddStaff(onDone);
  const depts = useQuery((t) => campus.departments(t)).data ?? [];
  return (
    <PopIn>
      <Card style={{ gap: 12, borderColor: color.accentLight }}>
        <Text variant="heading">Add staff account</Text>
        <Chips
          options={[
            { value: "GUARD", label: "Guard" },
            { value: "WARDEN", label: "Warden" },
            { value: "FACULTY", label: "Faculty" },
            { value: "ADMIN", label: "Admin" },
          ]}
          value={f.role}
          onChange={f.setRole}
        />
        {f.role === "FACULTY" && depts.length ? (
          <View style={{ gap: 6 }}>
            <Text variant="label">Department</Text>
            <Chips options={depts.map((d) => ({ value: d.id, label: d.name }))} value={f.departmentId} onChange={f.setDepartmentId} />
          </View>
        ) : null}
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
      <Field label="Parent's email" value={f.parentEmail} onChangeText={f.setParentEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Parent must have an Outpass account" />
      <Field label="Relation" value={f.relation} onChangeText={f.setRelation} />
      {f.error ? <ErrorNote message={f.error} /> : null}
      <Button compact label="Link parent" loading={f.submitting} onPress={f.submit} />
    </View>
  );
}

export default function People() {
  const vm = usePeople();
  const { token } = useSession();
  const ribbon = useRibbon();
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  /** For students who can't add their own, e.g. from the college ID database. */
  async function addPhoto(u: UserDto) {
    if (!token) return;
    setPhotoError(null);
    try {
      const image = await pickPhoto("library");
      if (!image) return;
      setPhotoFor(u.id);
      await api.uploadUserPhoto(token, u.id, image);
      await vm.reload();
      ribbon.show({ tone: "success", title: `Photo saved for ${u.name}` });
    } catch (err) {
      setPhotoError(errorMessage(err, "Couldn't save the photo"));
    } finally {
      setPhotoFor(null);
    }
  }

  // Hosteller ↔ day scholar. A day scholar loses their hostel room and warden.
  const [switching, setSwitching] = useState<string | null>(null);
  async function switchResidence(u: UserDto) {
    if (!token) return;
    const next = u.student?.residence === "DAY_SCHOLAR" ? "HOSTELLER" : "DAY_SCHOLAR";
    setSwitching(u.id);
    try {
      await campus.setResidence(token, u.id, next);
      await vm.reload();
      ribbon.show({ tone: "success", title: next === "DAY_SCHOLAR" ? `${u.name} is now a day scholar` : `${u.name} is now a hosteller`, body: next === "HOSTELLER" ? "Set their hostel and room from Import or Hostels." : "Their outpasses go to faculty or the HOD." });
    } catch (err) {
      setPhotoError(errorMessage(err, "Couldn't change where they stay"));
    } finally {
      setSwitching(null);
    }
  }

  return (
    <Screen
      title="People"
      eyebrow="Accounts"
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      right={<Button compact tone={adding ? "outline" : "accent"} icon={adding ? "close" : "add"} label={adding ? "Close" : "Staff"} onPress={() => setAdding((a) => !a)} />}
    >
      <QuickActions
        actions={[
          { key: "import", label: "Import students", icon: "cloud-upload-outline", onPress: () => router.push("/import") },
          { key: "hostels", label: "Hostels", icon: "business-outline", onPress: () => router.push("/hostels") },
          { key: "depts", label: "Departments", icon: "school-outline", onPress: () => router.push("/departments") },
          { key: "fees", label: "Fees", icon: "wallet-outline", onPress: () => router.push("/fees-admin") },
          { key: "review", label: "Review posts", icon: "shield-checkmark-outline", onPress: () => router.push("/review") },
          { key: "offers", label: "Offers", icon: "gift-outline", onPress: () => router.push("/offers-admin") },
          { key: "occasions", label: "Sales & seasons", icon: "sparkles-outline", onPress: () => router.push("/occasions-admin") },
          { key: "settings", label: "Settings", icon: "settings-outline", onPress: () => router.push("/settings") },
          { key: "activity", label: "Activity log", icon: "list-outline", onPress: () => router.push("/activity") },
        ]}
      />
      {photoError ? <ErrorNote message={photoError} /> : null}
      {adding ? <AddStaff onDone={() => { setAdding(false); void vm.reload(); }} /> : null}
      <Chips options={roleFilters.map((r) => ({ value: r.value, label: r.label }))} value={vm.role} onChange={vm.setRole} />
      {vm.error ? <ErrorNote message={vm.error} onRetry={vm.refresh} /> : null}
      {vm.loading ? <Loading /> : null}
      {!vm.loading && vm.users.length === 0 ? <Empty icon="id-card-outline" title="No accounts" /> : null}
      {vm.users.map((u, i) => (
        <FadeIn key={u.id} index={i}>
          <Card>
            <View style={styles.row}>
              <Avatar name={u.name} size={38} tone={u.role === "STUDENT" ? "accent" : "indigo"} photoUrl={u.photoUrl} />
              <View style={{ flex: 1 }}>
                <Text variant="label">{u.name}</Text>
                <Text variant="caption" numberOfLines={1}>{u.student?.rollNo ? `${u.student.rollNo} · ` : ""}{u.email}</Text>
              </View>
              {u.role === "STUDENT" ? (
                <Pill label={u.student?.residence === "DAY_SCHOLAR" ? "day scholar" : "hosteller"} tone={u.student?.residence === "DAY_SCHOLAR" ? "indigo" : "accent"} />
              ) : (
                <Pill label={u.role.toLowerCase()} tone="indigo" />
              )}
            </View>
            {u.role === "STUDENT" ? (
              linking === u.id ? (
                <LinkParent student={u} onDone={() => { setLinking(null); }} />
              ) : (
                <View style={styles.actions}>
                  <Button compact tone="ghost" label="Link a parent" style={{ paddingHorizontal: 0 }} onPress={() => setLinking(u.id)} />
                  <Button
                    compact
                    tone="ghost"
                    icon={u.photoUrl ? "image-outline" : "camera-outline"}
                    label={u.photoUrl ? "Change photo" : "Add photo"}
                    loading={photoFor === u.id}
                    style={{ paddingHorizontal: 0 }}
                    onPress={() => void addPhoto(u)}
                  />
                  <Button
                    compact
                    tone="ghost"
                    icon="swap-horizontal-outline"
                    label={u.student?.residence === "DAY_SCHOLAR" ? "Make hosteller" : "Make day scholar"}
                    loading={switching === u.id}
                    style={{ paddingHorizontal: 0 }}
                    onPress={() => void switchResidence(u)}
                  />
                </View>
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
  tools: { flexDirection: "row", gap: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", columnGap: 18, marginTop: 6 },
  notice: { padding: 12, borderRadius: 14, backgroundColor: color.greenSoft },
});
