/**
 * Outpass design tokens: "Indigo + Teal" (colour study option A).
 * Indigo carries structure: the header band, text and navigation. Teal carries
 * actions and "safe" states: primary buttons, the gate pass and approvals.
 */
export const color = {
  white: "#FFFFFF",
  ground: "#F5F6FB",
  line: "#E4E6F0",
  ink: "#12113A",
  muted: "#5B5F7A",
  faint: "#9A9EB6",
  /** Filled input background. */
  field: "#F0F2FA",

  /** Dark indigo header band and its secondary text. */
  head: "#1E1B4B",
  headSub: "#C7D2FE",

  indigo: "#4338CA",
  indigoDeep: "#3730A3",
  indigoTint: "#EEF2FF",

  /** Teal: actions, the live pass, approved and safe states. */
  accent: "#0F766E",
  accentLight: "#14B8A6",
  accentFrame: "#14B8A6",
  accentText: "#0F766E",
  accentSoft: "#F0FDFA",

  green: "#0F766E",
  greenBright: "#14B8A6",
  greenSoft: "#CCFBF1",

  amber: "#92400E",
  amberSoft: "#FEF3C7",

  red: "#B91C1C",
  redSoft: "#FEE2E2",
} as const;

export const font = {
  display: "Sora_700Bold",
  displaySemi: "Sora_600SemiBold",
  body: "Manrope_500Medium",
  bodySemi: "Manrope_600SemiBold",
  bodyBold: "Manrope_700Bold",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 12, md: 16, lg: 22, pill: 999 } as const;

export const shadow = {
  card: {
    shadowColor: "#1E1B4B",
    shadowOpacity: 0.07,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  primary: {
    shadowColor: "#4338CA",
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  accent: {
    shadowColor: "#0F766E",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
} as const;
