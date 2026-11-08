// Admin-only timeline composer. Events are informational, never scoring input.
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminAddMatchEvent, adminDeleteMatchEvent, getMatchEvents } from '@/api/matches';
import { colors, font, radius, spacing } from '@/theme';
import type { Fixture, MatchEventType } from '@/types';
import { Button, Card, SectionTitle } from './ui';

interface EventPlayer { id: string; first_name: string; last_name: string; position: string }

const EVENT_TYPES: Array<{ value: MatchEventType; label: string }> = [
  { value: 'try', label: 'Try' },
  { value: 'assist', label: 'Assist' },
  { value: 'conversion', label: 'Conversion' },
  { value: 'player_of_match', label: 'POTM' },
];

export function MatchEventsAdmin({ fixture, homePlayers, awayPlayers }: {
  fixture: Fixture;
  homePlayers: EventPlayer[];
  awayPlayers: EventPlayer[];
}) {
  const qc = useQueryClient();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [eventType, setEventType] = useState<MatchEventType>('try');
  const [minute, setMinute] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const eventsQuery = useQuery({ queryKey: ['match-events', fixture.id], queryFn: () => getMatchEvents(fixture.id) });
  const allPlayers = [...homePlayers, ...awayPlayers];
  const selectedPlayer = allPlayers.find((p) => p.id === playerId);
  const selectedTeamId = homePlayers.some((p) => p.id === playerId) ? fixture.home_team_id : fixture.away_team_id;

  const addMutation = useMutation({
    mutationFn: () => {
      if (!selectedPlayer) throw new Error('Select a player first.');
      const parsedMinute = minute.trim() ? Number(minute) : null;
      if (parsedMinute != null && (!Number.isInteger(parsedMinute) || parsedMinute < 0 || parsedMinute > 120)) {
        throw new Error('Minute must be a whole number from 0 to 120.');
      }
      return adminAddMatchEvent({
        fixture_id: fixture.id,
        player_id: selectedPlayer.id,
        team_id: selectedTeamId,
        event_type: eventType,
        minute: parsedMinute,
      });
    },
    onSuccess: () => {
      setMinute('');
      qc.invalidateQueries({ queryKey: ['match-events', fixture.id] });
    },
    onError: (error: Error) => Alert.alert('Could not add event', error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: adminDeleteMatchEvent,
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['match-events', fixture.id] });
    },
    onError: (error: Error) => Alert.alert('Could not delete event', error.message),
  });

  return (
    <View>
      <SectionTitle>Match event timeline</SectionTitle>
      <Card>
        <Text style={font.muted}>Timeline only: adding or deleting events does not change the score, player statistics or fantasy points. Use the scoring controls above for those.</Text>
        <Text style={[font.tiny, styles.controlLabel]}>1 · SELECT PLAYER</Text>
        <PlayerPicker title={fixture.home_short} players={homePlayers} selected={playerId} onSelect={setPlayerId} />
        <PlayerPicker title={fixture.away_short} players={awayPlayers} selected={playerId} onSelect={setPlayerId} />
        <Text style={[font.tiny, styles.controlLabel]}>2 · EVENT TYPE</Text>
        <View style={styles.typeRow}>
          {EVENT_TYPES.map((type) => (
            <Pressable key={type.value} onPress={() => setEventType(type.value)} style={[styles.typeChip, eventType === type.value && styles.selectedChip]} accessibilityRole="radio" accessibilityState={{ checked: eventType === type.value }} accessibilityLabel={`${type.label} event`}>
              <Text style={[styles.chipText, eventType === type.value && styles.selectedText]}>{type.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[font.tiny, styles.controlLabel]}>3 · OPTIONAL MINUTE</Text>
        <TextInput value={minute} onChangeText={(value) => setMinute(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={3} placeholder="e.g. 18" placeholderTextColor={colors.textMuted} style={styles.minuteInput} accessibilityLabel="Optional event minute, 0 to 120" />
        <Button title={selectedPlayer ? `Add ${EVENT_TYPES.find((t) => t.value === eventType)?.label} for ${selectedPlayer.first_name} ${selectedPlayer.last_name}` : 'Select a player to add an event'} disabled={!selectedPlayer} loading={addMutation.isPending} onPress={() => addMutation.mutate()} />
      </Card>

      {eventsQuery.isPending ? <ActivityIndicator color={colors.accent} /> : null}
      {eventsQuery.isError ? <Text style={font.muted}>Timeline storage is unavailable. Apply migration 0015 in Supabase, then reopen this fixture.</Text> : null}
      {(eventsQuery.data ?? []).map((event) => (
        <View key={event.id} style={styles.eventRow}>
          <View style={{ flex: 1 }}>
            <Text style={font.body}>{event.minute != null ? `${event.minute}′ · ` : ''}{EVENT_TYPES.find((t) => t.value === event.event_type)?.label} · {event.players.first_name} {event.players.last_name}</Text>
            <Text style={font.tiny}>Informational event · no scoring changes</Text>
          </View>
          {confirmDelete === event.id ? (
            <View style={styles.confirmRow}>
              <Pressable onPress={() => setConfirmDelete(null)} style={styles.cancelButton} accessibilityRole="button" accessibilityLabel="Cancel event deletion"><Text style={font.tiny}>Cancel</Text></Pressable>
              <Pressable onPress={() => deleteMutation.mutate(event.id)} disabled={deleteMutation.isPending} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel={`Confirm delete ${event.event_type} event for ${event.players.first_name} ${event.players.last_name}`}><Text style={styles.deleteText}>{deleteMutation.isPending ? '…' : 'Confirm'}</Text></Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirmDelete(event.id)} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel={`Delete ${event.event_type} event for ${event.players.first_name} ${event.players.last_name}`}><Text style={styles.deleteText}>Delete</Text></Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

function PlayerPicker({ title, players, selected, onSelect }: { title: string; players: EventPlayer[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <View>
      <Text style={[font.tiny, styles.teamLabel]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playerList} keyboardShouldPersistTaps="handled">
        {players.map((player) => (
          <Pressable key={player.id} onPress={() => onSelect(player.id)} style={[styles.playerChip, selected === player.id && styles.selectedChip]} accessibilityRole="radio" accessibilityState={{ checked: selected === player.id }} accessibilityLabel={`${player.first_name} ${player.last_name}, ${title}`}>
            <Text style={[styles.chipText, selected === player.id && styles.selectedText]}>{player.first_name} {player.last_name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  controlLabel: { marginTop: spacing(4), marginBottom: spacing(2), color: colors.accent, fontWeight: '800' },
  teamLabel: { marginBottom: spacing(1) },
  playerList: { gap: spacing(2), paddingBottom: spacing(2) },
  playerChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing(3), borderRadius: radius.full, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  typeChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing(3), borderRadius: radius.full, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  selectedChip: { backgroundColor: colors.accent, borderColor: colors.accent },
  selectedText: { color: '#0B3D2E' },
  minuteInput: { minHeight: 48, width: 120, color: colors.text, backgroundColor: colors.cardAlt, borderRadius: radius.sm, paddingHorizontal: spacing(3), fontSize: 16 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), padding: spacing(3), backgroundColor: colors.card, borderRadius: radius.sm, marginBottom: spacing(2) },
  deleteButton: { minHeight: 44, minWidth: 64, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing(2), borderRadius: radius.sm, backgroundColor: colors.danger },
  deleteText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  confirmRow: { flexDirection: 'row', gap: spacing(1) },
  cancelButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing(2) },
});
