import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Brand } from "../../src/components/Brand";
import { useSession } from "../../src/auth/session";
import { api, errorMessage } from "../../src/api/client";
import { color } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { ErrorNote, Segmented } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn } from "../../src/ui/motion";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

type Method = "phone" | "email";

export default function LoginScreen() {
  const { signIn, adopt } = useSession();
  const [method, setMethod] = useState<Method>("phone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A brand-new server has no admin yet: start first-time setup instead.
  useEffect(() => {
    api.setupStatus().then((s) => s.needsSetup && router.replace("/setup")).catch(() => undefined);
  }, []);

  async function run(fn: () => Promise<void>, fallback: string) {
    setError(null);
    setSubmitting(true);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setSubmitting(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      const res = await api.otpRequest(phone.trim());
      setCodeSent(true);
      setCode("");
      setInfo(res.message);
    }, "Couldn't send the code");

  // The auth layout redirects to the role's home once signed in.
  const verify = () => run(async () => adopt(await api.otpVerify(phone.trim(), code)), "Sign in failed");
  const signInEmail = () => run(() => signIn(email.trim(), password), "Sign in failed");

  return (
    <Screen>
      <View style={styles.top}>
        <FadeIn><Brand /></FadeIn>
        <FadeIn index={1}>
          <Text variant="caption" style={{ textAlign: "center" }}>Outpasses and visitors for your campus</Text>
        </FadeIn>
      </View>
      <FadeIn index={2} style={{ gap: 14 }}>
        <Segmented
          options={[
            { value: "phone", label: "Mobile number" },
            { value: "email", label: "Email" },
          ]}
          value={method}
          onChange={(m) => {
            setMethod(m);
            setError(null);
          }}
        />
        {method === "phone" ? (
          <>
            <Field
              label="Mobile number"
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                if (codeSent) setCodeSent(false);
              }}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder="98480 12345"
              hint={codeSent ? undefined : "The number your college has on file. We'll text you a code."}
            />
            {codeSent ? (
              <>
                {info ? <View style={styles.info}><Text variant="caption" style={{ color: color.ink }}>{info}</Text></View> : null}
                <Field
                  label="6-digit code"
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  placeholder="123456"
                  onSubmitEditing={verify}
                />
                {error ? <ErrorNote message={error} /> : null}
                <Button label="Sign in" loading={submitting} disabled={code.length !== 6} onPress={verify} />
                <Button tone="ghost" label="Send a new code" onPress={sendCode} disabled={submitting} />
              </>
            ) : (
              <>
                {error ? <ErrorNote message={error} /> : null}
                <Button label="Text me a code" icon="chatbubble-ellipses-outline" loading={submitting} disabled={phone.replace(/\D/g, "").length < 10} onPress={sendCode} />
              </>
            )}
          </>
        ) : (
          <>
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@college.edu" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="••••••••" onSubmitEditing={signInEmail} />
            {error ? <ErrorNote message={error} /> : null}
            <Button label="Sign in" loading={submitting} onPress={signInEmail} disabled={!email || !password} />
            <Link href={{ pathname: "/forgot", params: email ? { email } : {} }} style={styles.link}>
              <Text variant="label" style={{ color: color.muted }}>Forgot password?</Text>
            </Link>
          </>
        )}
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
  info: { padding: 12, borderRadius: 14, backgroundColor: color.indigoTint },
});
