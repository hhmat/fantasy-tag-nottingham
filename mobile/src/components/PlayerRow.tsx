// Player list row 2.0 — price + points + optional form dots, price movement,
// ownership and captain/POTM badges. All new props are optional; every
// existing call site keeps working unchanged.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme';
import { formatMoney } from '@/lib/scoring';
import { Badge } from './ui';
import { ArmbandIcon, FormDots, PriceArrow } from './fantasy';

export function PlayerRow({
  name,
  teamShort,
  position,
  price,
  points,
  isCaptain = false,
  isPom = false,
  form,
  priceDelta,
  ownership,
  right,
  onPress,
}: {
  name: string;
  teamShort: string;
  position: string;
  price?: number;
  points?: number;
  isCaptain?: boolean;
  /** Player of the Match badge (⭐) */
  isPom?: boolean;
  /** Last N gameweek point totals, oldest → newest */
  form?: number[];
  /** Price movement this week, e.g. +0.1 / -0.2 */
  priceDelta?: number | null;
  /** % of managers owning this player */
  ownership?: number | null;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const subtitle = [
    position,
    teamShort,
    ownership != null ? `${Math.round(ownership)}% owned` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${name}, ${position}, ${teamShort}${price != null ? `, ${formatMoney(price)}` : ''}${points != null ? `, ${points} points` : ''}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{teamShort.slice(0, 3)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2) }}>
          <Text style={font.h3} numberOfLines={1}>
            {name}
          </Text>
          {isCaptain ? <ArmbandIcon kind="captain" /> : null}
          {isPom ? <ArmbandIcon kind="pom" /> : null}
        </View>
        <Text style={font.tiny}>{subtitle}</Text>
        {form && form.length > 0 ? (
          <View style={{ marginTop: spacing(1) }}>
            <FormDots gameweeks={form} />
          </View>
        ) : null}
      </View>
      {price !== undefined ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.price}>{formatMoney(price)}</Text>
          <PriceArrow delta={priceDelta} />
        </View>
      ) : null}
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
    minHeight: 56,
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
