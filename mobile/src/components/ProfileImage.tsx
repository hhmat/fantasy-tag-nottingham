// Manager avatars and fantasy-team badges. Presets use local code-drawn
// styling; uploaded images use the public URL returned by Supabase Storage.
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/theme';

export const AVATAR_PRESETS = [
  { value: 'preset:rugby', emoji: '🏉', color: '#1E88E5', label: 'Rugby ball' },
  { value: 'preset:rocket', emoji: '🚀', color: '#6C5CE7', label: 'Rocket' },
  { value: 'preset:lion', emoji: '🦁', color: '#C77900', label: 'Lion' },
  { value: 'preset:fox', emoji: '🦊', color: '#D8562C', label: 'Fox' },
  { value: 'preset:lightning', emoji: '⚡', color: '#427A5B', label: 'Lightning' },
  { value: 'preset:trophy', emoji: '🏆', color: '#9C27B0', label: 'Trophy' },
] as const;

export function Avatar({ value, name, size = 56 }: {
  value?: string | null;
  name: string;
  size?: number;
}) {
  const preset = AVATAR_PRESETS.find((p) => p.value === value);
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (value && !preset) {
    return (
      <Image
        source={{ uri: value }}
        style={[shape, styles.image]}
        accessibilityLabel={`${name} avatar`}
      />
    );
  }
  return (
    <View
      style={[shape, styles.fallback, preset && { backgroundColor: preset.color }]}
      accessibilityLabel={`${name} avatar${preset ? `, ${preset.label}` : ''}`}
    >
      <Text style={{ fontSize: size * 0.46 }}>{preset?.emoji ?? initials(name, 2)}</Text>
    </View>
  );
}

export function TeamBadge({ value, name, primaryColor, secondaryColor, size = 64 }: {
  value?: string | null;
  name: string;
  primaryColor?: string;
  secondaryColor?: string;
  size?: number;
}) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (value) {
    return (
      <Image
        source={{ uri: value }}
        style={[shape, styles.image, { borderColor: secondaryColor ?? colors.accent }]}
        accessibilityLabel={`${name} team badge`}
      />
    );
  }
  const backgroundColor = primaryColor ?? colors.cardAlt;
  return (
    <View
      style={[
        shape,
        styles.fallback,
        styles.badge,
        { backgroundColor, borderColor: secondaryColor ?? colors.border },
      ]}
      accessibilityLabel={`${name} team badge`}
    >
      <Text style={{ color: readableText(backgroundColor), fontWeight: '900', fontSize: size * 0.27 }}>
        {initials(name, 3)}
      </Text>
    </View>
  );
}

function initials(name: string, limit: number) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, limit)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function readableText(hex: string) {
  const match = /^#([\da-f]{6})$/i.exec(hex);
  if (!match) return colors.text;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#0B3D2E' : '#FFFFFF';
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.cardAlt, borderWidth: 2, borderColor: colors.border },
  fallback: { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  badge: { borderWidth: 3, borderRadius: radius.full },
});
