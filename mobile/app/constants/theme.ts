// TLS design tokens — the approved POC look. Keep values in sync with the design brief.
import { StyleSheet } from "react-native";

export const colors = {
  navy: "#14213A",
  ivory: "#F4EFE6",
  card: "#FFFFFF",
  cardSoft: "#FBF8F2",
  line: "#DED4C1",
  muted: "#4A5263",
  ink: "#14213A",
  gold: "#D1AC66",
  goldDark: "#7A5414",
  sand: "#EAE1CF",
  successBg: "#E3EBDD",
  successFg: "#2F4A22",
  // Extras used by the kit (not in the palette brief, chosen to sit with it)
  danger: "#A93F32",
  dangerBg: "#F5E5E1",
  // Deeper red on a paler pink for small labels (tags, badges, KPI discs): ~5:1 so 12px text stays readable.
  dangerDeep: "#8A2E24",
  dangerSoft: "#F3E1DD",
  ivorySoft: "rgba(244, 239, 230, 0.72)",
  ivoryLine: "rgba(244, 239, 230, 0.28)",
} as const;

export const fonts = {
  serif: "CormorantGaramond_700Bold",
  serifSemi: "CormorantGaramond_600SemiBold",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodySemi: "DMSans_600SemiBold",
  bodyBold: "DMSans_700Bold",
} as const;

export const radii = {
  card: 16,
  button: 24,
  field: 12,
  chip: 20,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  screen: 20,
  card: 16,
} as const;

export const sizes = {
  control: 48,
  controlSmall: 40,
  icon: 22,
} as const;

export const typography = StyleSheet.create({
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.goldDark,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 32,
    lineHeight: 36,
    color: colors.ink,
  },
  h2: {
    fontFamily: fonts.serif,
    fontSize: 24,
    lineHeight: 28,
    color: colors.ink,
  },
  h3: {
    fontFamily: fonts.serifSemi,
    fontSize: 20,
    lineHeight: 24,
    color: colors.ink,
  },
  kpi: {
    fontFamily: fonts.serif,
    fontSize: 30,
    lineHeight: 34,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  bodyMuted: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  small: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  label: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  button: {
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    lineHeight: 20,
  },
});

export const theme = { colors, fonts, radii, spacing, sizes, typography };
export type Theme = typeof theme;
