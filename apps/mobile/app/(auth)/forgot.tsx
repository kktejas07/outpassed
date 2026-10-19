import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useForgotPassword } from "../../src/features/auth/useForgotPassword";
import { color } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { ErrorNote } from "../../src/ui/bits";
import { Field } from "../../src/ui/Field";
import { FadeIn } from "../../src/ui/motion";
import { Screen } from "../../src/ui/Screen";
import { Text } from "../../src/ui/Text";

export default function ForgotPassword() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const vm = useForgotPassword(email ?? "");
  return (
    <Screen
      title="Reset password"
      eyebrow={vm.step === "email" ? "Step 1 of 2" : "Step 2 of 2"}
      back
      footer={
        vm.step === "email" ? (
          <Button label="Email me a code" icon="mail-outline" loading={vm.busy} onPress={vm.sendCode} />
        ) : (
          <Button label="Set new password" icon="lock-closed-outline" loading={vm.busy} onPress={vm.reset} />
        )
      }
    >
      {vm.step === "email" ? (
        <FadeIn style={{ gap: 14 }}>
          <Text variant="body" style={{ color: color.muted }}>
            Enter the email on your Outpass account. We'll send a 6-digit code that works for 15 minutes.
          </Text>
          <Field label="Email" value={vm.email} onChangeText={vm.setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@college.edu" />
        </FadeIn>
      ) : (
        <FadeIn style={{ gap: 14 }}>
          {vm.info ? (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: color.indigoTint }}>
              <Text variant="caption" style={{ color: color.ink }}>{vm.info} Check spam if it doesn't arrive in a minute.</Text>
            </View>
          ) : null}
          <Field label="6-digit code" value={vm.code} onChangeText={vm.setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" placeholder="123456" />
          <Field label="New password" value={vm.password} onChangeText={vm.setPassword} secureTextEntry autoComplete="new-password" placeholder="At least 8 characters" />
          <Button tone="ghost" label="Send a new code" onPress={vm.sendCode} />
        </FadeIn>
      )}
      {vm.error ? <ErrorNote message={vm.error} /> : null}
    </Screen>
  );
}
