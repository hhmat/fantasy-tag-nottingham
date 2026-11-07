// Player list row with price + points, used across market/squad screens.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme';
import { formatMoney } from '@/lib/scoring';
import { Badge } from './ui';

export function PlayerRow({
  name,
  teamShort,
  position,
  price,
  points,
  isCaptain = false,
  right,
  onPress,
}: {
  name: string;
  teamShort: string;
  position: string;
  price?: number;
  points?: number;
  isCaptain?: boolean;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{teamShort.slice(0, 3)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2) }}>
          <Text style={font.h3} numberOfLines={1}>
            {name}
          </Text>
          {isCaptain ? <Badge text="C ×2" /> : null}
        </View>
        <Text style={font.tiny}>
          {position} · {teamShort}
        </Text>
      </View>
      {price !== undefined ? <Text style={styles.price}>{formatMoney(price)}</Text> : null}
      {points !== undefined ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.points}>{points}</Text>
          <Text style={font.tiny}>pts</Text>
        </View>
      ) : null}
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3),
    marginBottom: spacing(2),
    gap: spacing(3),
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  price: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  points: { color: colors.text, fontWeight: '800', fontSize: 16 },
});
