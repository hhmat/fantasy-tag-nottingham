// Lightweight native charts. No platform-specific or SVG dependency required.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme';

export interface ChartPoint {
  label: string;
  value: number;
}

export function FormChart({ points }: { points: ChartPoint[] }) {
  if (!points.length) return <Text style={font.muted}>Form will appear after the first match.</Text>;
  const max = Math.max(1, ...points.map((p) => p.value));
  const average = points.reduce((sum, p) => sum + p.value, 0) / points.length;
  return (
    <View accessibilityLabel={`Recent form: ${points.map((p) => `${p.label}, ${p.value} points`).join('; ')}. Average ${average.toFixed(1)} points.`}>
      <View style={styles.summary}>
        <Text style={font.tiny}>LAST {points.length} {points.length === 1 ? 'MATCH' : 'MATCHES'}</Text>
        <Text style={styles.average}>{average.toFixed(1)} avg pts</Text>
      </View>
      <View style={styles.chart}>
        {points.map((point, index) => (
          <View key={`${point.label}-${index}`} style={styles.column}>
            <Text style={styles.value}>{point.value}</Text>
            <View style={styles.track}>
              <View style={[styles.formBar, { height: `${Math.max(3, (point.value / max) * 100)}%` }]} />
            </View>
            <Text style={font.tiny}>{point.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function PriceChart({ points }: { points: ChartPoint[] }) {
  if (!points.length) return <Text style={font.muted}>No price changes yet.</Text>;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.1, max - min);
  return (
    <View accessibilityLabel={`Price history: ${points.map((p) => `${p.label}, £${p.value.toFixed(1)} million`).join('; ')}`}>
      <View style={styles.summary}>
        <Text style={font.tiny}>CHRONOLOGICAL PRICE</Text>
        <Text style={styles.average}>£{points[points.length - 1].value.toFixed(1)}m now</Text>
      </View>
      <View style={styles.chart}>
        {points.map((point, index) => {
          const height = values.length === 1 ? 100 : 25 + ((point.value - min) / range) * 75;
          return (
            <View key={`${point.label}-${index}`} style={styles.column}>
              <Text style={styles.value}>£{point.value.toFixed(1)}</Text>
              <View style={styles.track}>
                <View style={[styles.priceBar, { height: `${height}%` }]} />
              </View>
              <Text style={font.tiny} numberOfLines={1}>{point.label}</Text>
            </View>
          );
        })}
      </View>
      {points.length === 1 ? <Text style={font.tiny}>Starting price · no recorded movement</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  average: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  chart: {
    height: 158,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing(1),
    marginTop: spacing(3),
    paddingTop: spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  column: { flex: 1, minWidth: 0, alignItems: 'center' },
  value: { color: colors.text, fontSize: 10, fontWeight: '700', height: 16 },
  track: { flex: 1, width: '70%', justifyContent: 'flex-end', marginVertical: spacing(1) },
  formBar: { width: '100%', backgroundColor: colors.accent, borderRadius: radius.sm, minHeight: 3 },
  priceBar: { width: '100%', backgroundColor: colors.success, borderRadius: radius.sm, minHeight: 3 },
});
