import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { color, font } from "../theme/tokens";

type Variant = "display" | "title" | "heading" | "body" | "label" | "caption" | "eyebrow";

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: font.display, fontSize: 28, lineHeight: 34, color: color.ink, letterSpacing: -0.4 },
  title: { fontFamily: font.display, fontSize: 22, lineHeight: 28, color: color.ink, letterSpacing: -0.2 },
  heading: { fontFamily: font.displaySemi, fontSize: 16, lineHeight: 22, color: color.ink },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: color.ink },
  label: { fontFamily: font.bodySemi, fontSize: 13, lineHeight: 18, color: color.ink },
  caption: { fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: color.muted },
  eyebrow: { fontFamily: font.bodyBold, fontSize: 11, lineHeight: 14, color: color.muted, letterSpacing: 1.1, textTransform: "uppercase" },
};

export function Text({ variant = "body", style, ...rest }: TextProps & { variant?: Variant }) {
  return <RNText {...rest} style={[variants[variant], style]} />;
}
