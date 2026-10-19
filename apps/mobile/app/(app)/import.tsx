import Ionicons from "@expo/vector-icons/Ionicons";
import * as DocumentPicker from "expo-document-picker";
import { Platform, StyleSheet, Switch, View } from "react-native";
import type { ImportResult } from "@outpassed/shared";
import { useImport } from "../../src/features/admin/useAdmin";
import { color, radius } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { ErrorNote } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn, PopIn } from "../../src/ui/motion";
import { Pill } from "../../src/ui/Pill";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

const SAMPLE = `name,rollNo,email,phone,hostel,room,dateOfBirth,parentName,parentEmail,parentPhone,relation
Asha Rao,21CS104,asha@college.edu,98480 12345,Block C,214,2005-03-14,Lakshmi Rao,lakshmi@example.com,98480 55555,Mother`;

function Summary({ r }: { r: ImportResult }) {
  const s = r.summary;
  const items = [
    { n: s.created, label: r.dryRun ? "new students" : "students added", tone: "green" as const },
    { n: s.updated, label: r.dryRun ? "to update" : "updated", tone: "indigo" as const },
    { n: s.parentsCreated, label: r.dryRun ? "new parents" : "parents added", tone: "accent" as const },
    { n: s.hostelsCreated, label: r.dryRun ? "new hostels" : "hostels added", tone: "indigo" as const },
    { n: s.errors, label: "rows with problems", tone: "red" as const },
  ].filter((x) => x.n > 0);
  return (
    <View style={styles.summary}>
      {items.map((x) => (
        <Pill key={x.label} tone={x.tone} label={`${x.n} ${x.label}`} />
      ))}
    </View>
  );
}

function Rows({ r }: { r: ImportResult }) {
  // Problems first, so they're easy to fix in the spreadsheet.
  const rows = [...r.rows].sort((a, b) => Number(b.action === "error") - Number(a.action === "error")).slice(0, 60);
  return (
    <Card style={{ paddingVertical: 4 }}>
      {rows.map((row) => (
        <View key={row.row} style={styles.row}>
          <Ionicons
            name={row.action === "error" ? "alert-circle" : row.action === "create" ? "add-circle" : "refresh-circle"}
            size={20}
            color={row.action === "error" ? color.red : row.action === "create" ? color.green : color.indigo}
          />
          <View style={{ flex: 1 }}>
            <Text variant="label" numberOfLines={1}>
              {row.name || "—"} <Text variant="caption">· {row.rollNo || "no roll no."} · row {row.row}</Text>
            </Text>
            <Text variant="caption" style={row.action === "error" ? { color: color.red } : undefined} numberOfLines={2}>
              {row.message ??
                [row.action === "create" ? "New student" : "Update existing", row.parent === "create" ? "new parent" : row.parent === "link" ? "link parent" : null]
                  .filter(Boolean)
                  .join(" · ")}
            </Text>
          </View>
        </View>
      ))}
      {r.rows.length > rows.length ? <Text variant="caption" style={{ padding: 12 }}>…and {r.rows.length - rows.length} more rows</Text> : null}
    </Card>
  );
}

/** Admins add a whole batch of students (and their parents) from a spreadsheet. */
export default function ImportStudents() {
  const vm = useImport();

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "text/plain"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
    vm.setCsv(text);
    vm.setFileName(asset.name);
  }

  const result = vm.done ?? vm.preview;
  const rowsInFile = vm.csv.trim() ? vm.csv.trim().split(/\r?\n/).length - 1 : 0;

  return (
    <Screen
      title="Import students"
      eyebrow="People"
      back
      footer={
        vm.preview && vm.preview.summary.created + vm.preview.summary.updated > 0 ? (
          <Button
            tone="success"
            icon="cloud-upload-outline"
            label={`Import ${vm.preview.summary.created + vm.preview.summary.updated} student${vm.preview.summary.created + vm.preview.summary.updated === 1 ? "" : "s"}`}
            loading={vm.busy}
            onPress={vm.commit}
          />
        ) : (
          <Button icon="eye-outline" label="Check file" loading={vm.busy} disabled={!vm.csv.trim()} onPress={vm.check} />
        )
      }
    >
      <FadeIn>
        <Card style={{ gap: 12 }}>
          <Text variant="heading">Spreadsheet (CSV)</Text>
          <Text variant="caption">
            Save your class list as CSV. Columns: name, rollNo, and email or phone. Optional: hostel, room, dateOfBirth, parentName, parentEmail, parentPhone, relation.
            Students and parents sign in with a code sent to their WhatsApp, or set a password with “Forgot password”.
          </Text>
          <Button tone="outline" icon="document-attach-outline" label={vm.fileName ? `Loaded ${vm.fileName}` : "Choose a CSV file"} onPress={() => void pickFile()} />
          <Field
            label="…or paste it here"
            value={vm.csv}
            onChangeText={(v) => {
              vm.setCsv(v);
              vm.setFileName(null);
            }}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={SAMPLE}
            style={styles.csv}
            hint={rowsInFile ? `${rowsInFile} row${rowsInFile === 1 ? "" : "s"} below the header` : undefined}
          />
          <View style={styles.toggle}>
            <View style={{ flex: 1 }}>
              <Text variant="label">Send welcome messages</Text>
              <Text variant="caption">On WhatsApp (and email), telling new students and parents how to sign in.</Text>
            </View>
            <Switch value={vm.sendWelcome} onValueChange={vm.setSendWelcome} trackColor={{ true: color.indigo, false: color.line }} />
          </View>
          {!vm.csv ? <Button compact tone="ghost" label="Use the sample format" style={{ alignSelf: "flex-start" }} onPress={() => vm.setCsv(SAMPLE)} /> : null}
        </Card>
      </FadeIn>
      {vm.error ? <ErrorNote message={vm.error} /> : null}
      {result ? (
        <PopIn style={{ gap: 12 }}>
          <Text variant="eyebrow">{result.dryRun ? "Preview · nothing saved yet" : "Imported"}</Text>
          <Summary r={result} />
          <Rows r={result} />
        </PopIn>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  csv: { minHeight: 140, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 12 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: color.ground },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: color.line },
});
