/**
 * Arvio design tokens: mostly white, gold for the pass and primary actions,
 * indigo for structure and text. Matches the "Arvio — App Prototype" canvas.
 */
export const color = {
  white: "#FFFFFF",
  ground: "#FAF9FE",
  line: "#ECEAF5",
  ink: "#1E1B4B",
  muted: "#6B6B85",
  faint: "#A3A1B8",

  indigo: "#4338CA",
  indigoDeep: "#312E81",
  indigoTint: "#F1EFFA",

  gold: "#C9A227",
  goldLight: "#E9C46A",
  goldFrame: "#D4AF37",
  goldText: "#7A5C0A",
  goldSoft: "#FFFBEB",

  green: "#15803D",
  greenBright: "#16A34A",
  greenSoft: "#F0FDF4",

  amber: "#92400E",
  amberSoft: "#FEF3C7",

  red: "#B91C1C",
  redSoft: "#FEF2F2",
} as const;

export const font = {
  display: "Sora_700Bold",
  displaySemi: "Sora_600SemiBold",
  body: "Manrope_500Medium",
  bodySemi: "Manrope_600SemiBold",
  bodyBold: "Manrope_700Bold",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

export const shadow = {
  card: {
    shadowColor: "#1E1B4B",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  gold: {
    shadowColor: "#C9A227",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
} as const;
