import type { SetupStatus } from "@outpassed/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { api, errorMessage } from "../../src/api/client";
import { useSession } from "../../src/auth/session";
import { color } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { ErrorNote, Loading } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn } from "../../src/ui/motion";
import { useRibbon } from "../../src/ui/Ribbon";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

/** First run on a new server: name the college, create the first admin, list hostels. */
export default function SetupScreen() {
  const { adopt } = useSession();
  const ribbon = useRibbon();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [institutionName, setInstitutionName] = useState("");
  const [address, setAddress] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hostels, setHostels] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .setupStatus()
      .then((s) => (s.needsSetup ? setStatus(s) : router.replace("/login")))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const hostelList = hostels.split(/[\n,]/).map((h) => h.trim()).filter(Boolean);
  const valid = institutionName.trim().length >= 2 && adminName.trim() && adminEmail.includes("@") && password.length >= 8 && (!status?.tokenRequired || setupToken.trim());

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.setup({
        institutionName: institutionName.trim(),
        address: address.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        password,
        hostels: hostelList,
        setupToken: setupToken.trim() || undefined,
      });
      await adopt(res);
      ribbon.show({ tone: "success", title: `${institutionName.trim()} is ready`, body: "Next: add staff and import your students.", celebrate: true });
    } catch (err) {
      setError(errorMessage(err, "Setup failed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!status) {
    return <Screen title="Set up Outpass" eyebrow="First run">{error ? <ErrorNote message={error} /> : <Loading />}</Screen>;
  }

  return (
    <Screen title="Set up Outpass" eyebrow="First run" footer={<Button label="Finish setup" icon="checkmark" loading={submitting} disabled={!valid} onPress={submit} />}>
      <FadeIn>
        <View style={styles.intro}>
          <Text variant="heading">Welcome</Text>
          <Text variant="caption" style={{ color: color.ink }}>
            This takes a minute. You'll be the first admin and can add wardens, guards and students afterwards.
          </Text>
        </View>
      </FadeIn>
      <FadeIn index={1}>
        <Card style={{ gap: 14 }}>
          <Text variant="eyebrow">Your college</Text>
          <Field label="College or school name" value={institutionName} onChangeText={setInstitutionName} placeholder="e.g. Sri Venkateswara Institute of Technology" />
          <Field label="Address" value={address} onChangeText={setAddress} placeholder="Shown on visitor passes" />
          <Field
            label="Hostels"
            value={hostels}
            onChangeText={setHostels}
            multiline
            placeholder={"Block A\nBlock C\nGirls Hostel"}
            hint={hostelList.length ? `${hostelList.length} hostel${hostelList.length > 1 ? "s" : ""} · one per line. You can add more later.` : "One per line. You can add more later."}
          />
        </Card>
      </FadeIn>
      <FadeIn index={2}>
        <Card style={{ gap: 14 }}>
          <Text variant="eyebrow">First admin</Text>
          <Field label="Your name" value={adminName} onChangeText={setAdminName} placeholder="Full name" />
          <Field label="Email" value={adminEmail} onChangeText={setAdminEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@college.edu" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="At least 8 characters" />
          {status.tokenRequired ? (
            <Field label="Setup key" value={setupToken} onChangeText={setSetupToken} autoCapitalize="none" secureTextEntry hint="The SETUP_TOKEN value from the server's settings." />
          ) : null}
        </Card>
      </FadeIn>
      {error ? <ErrorNote message={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 6, padding: 16, borderRadius: 16, backgroundColor: color.indigoTint },
});
