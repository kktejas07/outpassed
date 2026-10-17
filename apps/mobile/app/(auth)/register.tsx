import { Link } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSession } from "../../src/auth/session";
import { errorMessage } from "../../src/api/client";
import { color } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { ErrorNote, Segmented } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn } from "../../src/ui/motion";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

export default function RegisterScreen() {
  const { signUp } = useSession();
  const [role, setRole] = useState<"STUDENT" | "PARENT">("STUDENT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [hostel, setHostel] = useState("");
  const [room, setRoom] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!name.trim()) return setError("Enter your name");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return setError("Date of birth should look like 2005-03-14");
    setSubmitting(true);
    try {
      await signUp({
        role,
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        ...(role === "STUDENT"
          ? { rollNo: rollNo.trim() || undefined, hostel: hostel.trim() || undefined, room: room.trim() || undefined, dateOfBirth: dob || undefined }
          : {}),
      });
    } catch (err) {
      setError(errorMessage(err, "Could not create account"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen title="Create account" eyebrow="Arvio" back footer={<Button label="Create account" loading={submitting} onPress={onSubmit} />}>
      <FadeIn>
        <Segmented options={[{ value: "STUDENT", label: "I'm a student" }, { value: "PARENT", label: "I'm a parent" }]} value={role} onChange={setRole} />
      </FadeIn>
      <FadeIn index={1} style={{ gap: 14 }}>
        <Field label="Full name" value={name} onChangeText={setName} placeholder="As on your college ID" />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91 98xxx xxxxx" hint={role === "PARENT" ? "Used to reach you about approvals" : undefined} />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" />
      </FadeIn>
      {role === "STUDENT" ? (
        <FadeIn index={2} style={{ gap: 14 }}>
          <Text variant="eyebrow" style={{ marginTop: 4 }}>Hostel details</Text>
          <Field label="Roll number" value={rollNo} onChangeText={setRollNo} autoCapitalize="characters" placeholder="e.g. 21CS104" />
          <View style={styles.row}>
            <View style={{ flex: 1.4 }}><Field label="Hostel" value={hostel} onChangeText={setHostel} placeholder="Block C" /></View>
            <View style={{ flex: 1 }}><Field label="Room" value={room} onChangeText={setRoom} placeholder="214" /></View>
          </View>
          <Field label="Date of birth" value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" hint="Decides whether parent approval is needed once you're 18" />
        </FadeIn>
      ) : (
        <FadeIn index={2}>
          <View style={styles.note}>
            <Text variant="caption" style={{ color: color.ink }}>
              After you sign up, the hostel office links your account to your child. You'll then see their outpass requests here.
            </Text>
          </View>
        </FadeIn>
      )}
      {error ? <ErrorNote message={error} /> : null}
      <Link href="/login" style={{ alignSelf: "center" }}>
        <Text variant="label" style={{ color: color.indigo }}>Already have an account? Sign in</Text>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  note: { padding: 14, borderRadius: 14, backgroundColor: color.indigoTint },
});
