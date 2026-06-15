/**
 * Mobile design tokens. Airbnb-style: clean white surfaces, a green brand
 * accent (matching the web dashboard), generous radii, soft shadows.
 * No emojis anywhere in the UI; icons come from components/Icon.tsx.
 */
export const COLORS = {
  brand: '#1c8c5a',
  brandDark: '#157049',
  ink: '#1d2b24',
  body: '#44544c',
  muted: '#6b7a72',
  line: '#e6ece9',
  lineStrong: '#d4ddd8',
  bg: '#ffffff',
  bgSoft: '#f4f8f5',
  danger: '#c13515',
  warn: '#e8800c',
  white: '#ffffff',
  // Severity / hazard accents (shared with the map overlay).
  sev3: '#d7263d',
  sev2: '#e8800c',
  sev1: '#1c8c5a',
} as const;

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  floating: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
} as const;
