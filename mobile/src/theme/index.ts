// Design tokens — dark pitch-green theme
export const colors = {
  bg: '#0B3D2E',          // deep pitch green
  bgAlt: '#0F4A38',
  card: '#135643',
  cardAlt: '#1A6B52',
  accent: '#FFD54F',      // tag-belt yellow
  accentAlt: '#FF6F00',
  text: '#FFFFFF',
  textMuted: '#A7C9BB',
  danger: '#FF5252',
  success: '#4CAF50',
  border: 'rgba(255,255,255,0.12)',
};

export const spacing = (n: number) => n * 4;

export const radius = { sm: 8, md: 12, lg: 20, full: 999 };

export const font = {
  h1: { fontSize: 28, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 14, fontWeight: '400' as const, color: colors.text },
  muted: { fontSize: 13, fontWeight: '400' as const, color: colors.textMuted },
  tiny: { fontSize: 11, fontWeight: '500' as const, color: colors.textMuted },
};
