import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { color, font, radius } from "../theme/tokens";
import { Text } from "./Text";

export function Field({ label, hint, error, style, ...rest }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="label" style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={color.faint}
        {...rest}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
        style={[
          styles.input,
          rest.multiline && styles.multiline,
          focused && styles.focused,
          error ? styles.errored : null,
          style,
        ]}
      />
      {error ? <Text variant="caption" style={{ color: color.red }}>{error}</Text> : hint ? <Text variant="caption">{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: color.ink },
  input: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: color.field,
    paddingHorizontal: 14,
    fontFamily: font.body,
    fontSize: 15.5,
    color: color.ink,
  },
  multiline: { minHeight: 92, paddingTop: 14, textAlignVertical: "top" },
  focused: { borderColor: color.indigo, backgroundColor: color.white },
  errored: { borderColor: color.red },
});
