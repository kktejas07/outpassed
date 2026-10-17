import { Link } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Brand } from "../../src/components/Brand";
import { useSession } from "../../src/auth/session";
import { errorMessage } from "../../src/api/client";
import { color } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { ErrorNote } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn } from "../../src/ui/motion";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

export default function LoginScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // The auth layout redirects to the role's home.
    } catch (err) {
      setError(errorMessage(err, "Sign in failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.top}>
        <FadeIn><Brand /></FadeIn>
        <FadeIn index={1}>
          <Text variant="caption" style={{ textAlign: "center" }}>Outpasses and visitors for your campus</Text>
        </FadeIn>
      </View>
      <FadeIn index={2} style={{ gap: 14 }}>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@college.edu" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="••••••••" onSubmitEditing={onSubmit} />
        {error ? <ErrorNote message={error} /> : null}
        <Button label="Sign in" loading={submitting} onPress={onSubmit} disabled={!email || !password} />
        <Link href="/register" style={styles.link}>
          <Text variant="label" style={{ color: color.indigo }}>New student or parent? Create an account</Text>
        </Link>
        <Text variant="caption" style={{ textAlign: "center" }}>Wardens, guards and admins get their login from the college office.</Text>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "center", gap: 10, paddingTop: 56, paddingBottom: 20 },
  link: { textAlign: "center", alignSelf: "center", marginTop: 4 },
});
