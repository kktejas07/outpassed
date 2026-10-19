import Ionicons from "@expo/vector-icons/Ionicons";
import type { SetupStatus } from "@outpassed/shared";
import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WelcomeHero } from "../../src/components/WelcomeHero";
import { useSession } from "../../src/auth/session";
import { api, errorMessage } from "../../src/api/client";
import { color, font, radius } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { ErrorNote, Segmented } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn } from "../../src/ui/motion";
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
  const [demo, setDemo] = useState<SetupStatus["demo"]>(null);
  const [demoBusy, setDemoBusy] = useState<string | null>(null);

  // A brand-new server has no admin yet: start first-time setup instead.
  // Demo servers also list their test accounts here.
  useEffect(() => {
    api
      .setupStatus()
      .then((s) => {
        if (s.needsSetup) router.replace("/setup");
        else setDemo(s.demo ?? null);
      })
      .catch(() => undefined);
  }, []);

  async function demoSignIn(email: string) {
    if (!demo) return;
    setError(null);
    setDemoBusy(email);
    try {
      await signIn(email, demo.password);
    } catch (err) {
      setError(errorMessage(err, "Sign in failed"));
    } finally {
      setDemoBusy(null);
    }
  }

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
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <WelcomeHero />
      <View style={styles.body}>
      <Text style={styles.formTitle}>Sign in</Text>
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
              hint={codeSent ? undefined : "The number your college has on file. We'll send you a code on WhatsApp."}
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
                <Button label="Send code on WhatsApp" icon="logo-whatsapp" loading={submitting} disabled={phone.replace(/\D/g, "").length < 10} onPress={sendCode} />
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
      {demo?.accounts.length ? (
        <FadeIn index={3} style={styles.demo}>
          <View style={styles.demoHead}>
            <Ionicons name="flask-outline" size={18} color={color.indigo} />
            <View style={{ flex: 1 }}>
              <Text variant="label">Demo accounts</Text>
              <Text variant="caption">Tap a role to sign in. Password for all: <Text style={styles.mono}>{demo.password}</Text></Text>
            </View>
          </View>
          <View style={styles.demoGrid}>
            {demo.accounts.map((a) => (
              <Pressable
                key={a.email}
                accessibilityRole="button"
                accessibilityLabel={`Sign in as ${a.label}, ${a.name}`}
                disabled={!!demoBusy}
                onPress={() => void demoSignIn(a.email)}
                style={({ pressed }) => [styles.demoBtn, pressed && { opacity: 0.7 }, demoBusy === a.email && { backgroundColor: color.indigoTint }]}
              >
                <Text style={styles.demoRole}>{demoBusy === a.email ? "Signing in…" : a.label}</Text>
                <Text variant="caption" numberOfLines={1}>{a.email}</Text>
              </Pressable>
            ))}
          </View>
        </FadeIn>
      ) : null}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  body: { paddingHorizontal: 20, paddingTop: 22, gap: 14 },
  formTitle: { fontFamily: font.display, fontSize: 22, color: color.ink, letterSpacing: -0.3 },
  link: { textAlign: "center", alignSelf: "center", marginTop: 4 },
  info: { padding: 12, borderRadius: 14, backgroundColor: color.indigoTint },
  demo: { marginTop: 22, padding: 14, gap: 12, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: "dashed", borderColor: color.headSub, backgroundColor: color.white },
  demoHead: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  demoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  demoBtn: { flexGrow: 1, flexBasis: "46%", padding: 10, borderRadius: radius.sm, backgroundColor: color.ground, gap: 1 },
  demoRole: { fontFamily: font.bodyBold, fontSize: 14, color: color.indigoDeep },
  mono: { fontFamily: font.bodyBold, color: color.ink },
});
