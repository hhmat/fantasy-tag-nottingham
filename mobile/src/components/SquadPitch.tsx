// Phase 4 — interactive Try Tag Rugby pitch. PanResponder keeps drag support
// native to Expo on iOS, Android and web; tap controls provide an accessible
// alternative to every formation gesture.
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PanResponderGestureState,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { getFormation, saveFormation } from '@/api/formations';
import { setCaptaincyForGameweek, type CaptaincyRole } from '@/api/fantasy';
import {
  clampPitchCoordinate,
  defaultFormation,
  FORMATION_SLOTS,
  mergeFormation,
  nearestStarter,
  normaliseBenchOrder,
  STARTING_PLAYERS,
} from '@/lib/formation';
import { formatMoney } from '@/lib/scoring';
import { colors, font, radius, spacing } from '@/theme';
import type { FormationEntry, SquadPlayer } from '@/types';
import { Button, Card } from '@/components/ui';

type PitchFrame = { x: number; y: number; width: number; height: number };
type Preview = { squadRowId: string; x: number; y: number } | null;

function playerName(player: SquadPlayer) {
  return `${player.player.first_name} ${player.player.last_name}`;
}

function PlayerToken({ player, entry, selected = false, ghost = false }: {
  player: SquadPlayer;
  entry: FormationEntry;
  selected?: boolean;
  ghost?: boolean;
}) {
  const armband = player.is_captain ? 'C' : player.is_vice_captain ? 'V' : null;
  return (
    <View style={[styles.token, selected && styles.tokenSelected, ghost && styles.tokenGhost]}>
      <View style={styles.shirt}>
        <Text style={styles.shirtText} numberOfLines={1}>{player.player.team_short.slice(0, 3)}</Text>
        {armband ? (
          <View style={[styles.armband, armband === 'V' && styles.viceArmband]}>
            <Text style={styles.armbandText}>{armband}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.playerName} numberOfLines={1}>{player.player.last_name}</Text>
      <Text style={styles.playerMeta} numberOfLines={1}>
        {entry.is_starter ? player.player.position : `SUB ${entry.bench_order}`}
      </Text>
    </View>
  );
}

function PitchPlayer({ player, entry, locked, selected, pitchSize, onPress, onMove }: {
  player: SquadPlayer;
  entry: FormationEntry;
  locked: boolean;
  selected: boolean;
  pitchSize: { width: number; height: number };
  onPress: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ entry, locked, pitchSize, onMove });
  latest.current = { entry, locked, pitchSize, onMove };
  const start = useRef({ x: entry.position_x, y: entry.position_y });
  const didDrag = useRef(false);
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      !latest.current.locked && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3),
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      !latest.current.locked && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3),
    onPanResponderGrant: () => {
      didDrag.current = false;
      start.current = {
        x: latest.current.entry.position_x,
        y: latest.current.entry.position_y,
      };
      setDragging(true);
    },
    onPanResponderMove: (_event, gesture) => {
      didDrag.current = true;
      const current = latest.current;
      if (!current.pitchSize.width || !current.pitchSize.height) return;
      current.onMove(
        clampPitchCoordinate(start.current.x + gesture.dx / current.pitchSize.width),
        clampPitchCoordinate(start.current.y + gesture.dy / current.pitchSize.height),
      );
    },
    onPanResponderRelease: () => setDragging(false),
    onPanResponderTerminate: () => setDragging(false),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  })).current;

  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.pitchPlayer,
        {
          left: `${entry.position_x * 100}%`,
          top: `${entry.position_y * 100}%`,
          opacity: dragging ? 0.75 : 1,
        },
        Platform.OS === 'web' && styles.webDragHandle,
      ]}
    >
      <Pressable
        onPress={() => {
          if (didDrag.current) {
            didDrag.current = false;
          } else {
            onPress();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={`${playerName(player)}, ${player.player.position}, starter. Tap for player actions or drag to reposition.`}
        style={Platform.OS === 'web' && styles.webDragHandle}
      >
        <PlayerToken player={player} entry={entry} selected={selected || dragging} />
      </Pressable>
    </View>
  );
}

function SubstitutePlayer({ player, entry, locked, selected, getPitchFrame, measurePitch, onPress, onPreview, onDrop }: {
  player: SquadPlayer;
  entry: FormationEntry;
  locked: boolean;
  selected: boolean;
  getPitchFrame: () => PitchFrame | null;
  measurePitch: () => void;
  onPress: () => void;
  onPreview: (preview: Preview) => void;
  onDrop: (squadRowId: string, x: number, y: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ entry, locked, getPitchFrame, measurePitch, onPress, onPreview, onDrop });
  latest.current = { entry, locked, getPitchFrame, measurePitch, onPress, onPreview, onDrop };

  const pointFromGesture = (gesture: PanResponderGestureState) => {
    const frame = latest.current.getPitchFrame();
    if (!frame?.width || !frame.height) return null;
    const inside = gesture.moveX >= frame.x && gesture.moveX <= frame.x + frame.width
      && gesture.moveY >= frame.y && gesture.moveY <= frame.y + frame.height;
    if (!inside) return null;
    return {
      x: clampPitchCoordinate((gesture.moveX - frame.x) / frame.width),
      y: clampPitchCoordinate((gesture.moveY - frame.y) / frame.height),
    };
  };

  const responder = useRef(PanResponder.create({
    // Bench drags usually begin with a long vertical move towards the pitch.
    // Claim the start before the parent ScrollView can reserve that gesture.
    onStartShouldSetPanResponder: () => !latest.current.locked,
    onStartShouldSetPanResponderCapture: () => !latest.current.locked,
    onMoveShouldSetPanResponder: () => !latest.current.locked,
    onMoveShouldSetPanResponderCapture: () => !latest.current.locked,
    onPanResponderGrant: () => {
      setDragging(true);
      latest.current.measurePitch();
    },
    onPanResponderMove: (_event, gesture) => {
      const point = pointFromGesture(gesture);
      latest.current.onPreview(point
        ? { squadRowId: latest.current.entry.squad_row_id, ...point }
        : null);
    },
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) < 3 && Math.abs(gesture.dy) < 3) {
        latest.current.onPress();
      } else {
        const point = pointFromGesture(gesture);
        if (point) latest.current.onDrop(latest.current.entry.squad_row_id, point.x, point.y);
      }
      latest.current.onPreview(null);
      setDragging(false);
    },
    onPanResponderTerminate: () => {
      latest.current.onPreview(null);
      setDragging(false);
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  })).current;

  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.substitute,
        dragging && styles.substituteActive,
        Platform.OS === 'web' && styles.webDragHandle,
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${playerName(player)}, substitute ${entry.bench_order}. Tap for actions or drag onto the pitch to swap.`}
        style={({ pressed }) => [pressed && styles.substituteActive, Platform.OS === 'web' && styles.webDragHandle]}
      >
        <PlayerToken player={player} entry={entry} selected={selected || dragging} />
      </Pressable>
    </View>
  );
}

function PitchMarkings() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 10 }, (_, index) => (
        <View
          key={index}
          style={[styles.stripe, { top: `${index * 10}%` }, index % 2 === 0 && styles.stripeAlt]}
        />
      ))}
      <View style={[styles.tryZone, styles.tryZoneTop]} />
      <View style={[styles.tryZone, styles.tryZoneBottom]} />
      <View style={[styles.fieldLine, styles.tryLineTop]} />
      <View style={[styles.fieldLine, styles.tryLineBottom]} />
      <View style={[styles.fieldLine, styles.halfwayLine]} />
      <View style={[styles.dashedLine, styles.attackingLine]} />
      <View style={[styles.dashedLine, styles.defensiveLine]} />
      <View style={styles.centreMark} />
      <Text style={[styles.pitchLabel, styles.attackLabel]}>ATTACK</Text>
      <Text style={[styles.pitchLabel, styles.defendLabel]}>DEFEND</Text>
      <Text style={[styles.pitchLabel, styles.halfwayLabel]}>HALFWAY</Text>
    </View>
  );
}

export function SquadPitch({ fantasyTeamId, gameweekId, gameweekName, squad, locked }: {
  fantasyTeamId: string;
  gameweekId: number;
  gameweekName: string;
  squad: SquadPlayer[];
  locked: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<FormationEntry[]>(() => defaultFormation(squad));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [preview, setPreview] = useState<Preview>(null);
  const [pitchSize, setPitchSize] = useState({ width: 0, height: 0 });
  const pitchRef = useRef<View>(null);
  const pitchFrame = useRef<PitchFrame | null>(null);
  const squadKey = squad.map((player) => player.id).join('|');

  const { data: savedFormation, isError: formationLoadFailed } = useQuery({
    queryKey: ['formation', fantasyTeamId, gameweekId],
    queryFn: () => getFormation(fantasyTeamId, gameweekId),
  });

  useEffect(() => {
    if (savedFormation === undefined) return;
    setEntries(mergeFormation(squad, savedFormation));
    setDirty(savedFormation.length === 0 && squad.length > 0);
    setSaveMessage('');
    // squadKey deliberately tracks membership only: captaincy updates must not
    // discard an unsaved drag formation.
  }, [squadKey, savedFormation, fantasyTeamId, gameweekId]);

  useEffect(() => {
    if (selectedId && !squad.some((player) => player.id === selectedId)) setSelectedId(null);
  }, [squadKey, selectedId]);

  const measurePitch = () => {
    pitchRef.current?.measureInWindow((x, y, width, height) => {
      pitchFrame.current = { x, y, width, height };
    });
  };

  const changeEntries = (updater: (current: FormationEntry[]) => FormationEntry[]) => {
    setEntries((current) => normaliseBenchOrder(updater(current)));
    setDirty(true);
    setSaveMessage('');
  };

  const saveMut = useMutation({
    mutationFn: (nextEntries: FormationEntry[]) => saveFormation({
      fantasyTeamId,
      gameweekId,
      entries: nextEntries,
    }),
    onSuccess: () => {
      setDirty(false);
      setSaveMessage(`Formation saved for ${gameweekName}.`);
      queryClient.invalidateQueries({ queryKey: ['formation', fantasyTeamId, gameweekId] });
    },
    onError: (error: any) => Alert.alert('Could not save formation', error.message),
  });

  const captainMut = useMutation({
    mutationFn: ({ rowId, role, selected }: { rowId: string; role: CaptaincyRole; selected: boolean }) =>
      setCaptaincyForGameweek({
        teamId: fantasyTeamId,
        squadRowId: rowId,
        gameweekId,
        role,
        selected,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['squad', fantasyTeamId] }),
    onError: (error: any) => Alert.alert('Captaincy change failed', error.message),
  });

  const movePlayer = (squadRowId: string, x: number, y: number) => {
    changeEntries((current) => current.map((entry) => entry.squad_row_id === squadRowId
      ? { ...entry, position_x: x, position_y: y }
      : entry));
  };

  const swapPlayers = (current: FormationEntry[], firstId: string, secondId: string) => {
    const first = current.find((entry) => entry.squad_row_id === firstId);
    const second = current.find((entry) => entry.squad_row_id === secondId);
    if (!first || !second || first.is_starter === second.is_starter) return current;
    const starter = first.is_starter ? first : second;
    const substitute = first.is_starter ? second : first;
    return current.map((entry) => {
      if (entry.squad_row_id === starter.squad_row_id) {
        return { ...entry, is_starter: false, position_x: 0.5, position_y: 0.9 };
      }
      if (entry.squad_row_id === substitute.squad_row_id) {
        return {
          ...entry,
          is_starter: true,
          position_x: starter.position_x,
          position_y: starter.position_y,
        };
      }
      return entry;
    });
  };

  const dropSubstitute = (squadRowId: string, x: number, y: number) => {
    changeEntries((current) => {
      const target = nearestStarter(current, x, y);
      if (target) {
        const swapped = swapPlayers(current, squadRowId, target.squad_row_id);
        return swapped.map((entry) => entry.squad_row_id === squadRowId
          ? { ...entry, position_x: x, position_y: y }
          : entry);
      }
      return current.map((entry) => entry.squad_row_id === squadRowId
        ? { ...entry, is_starter: true, position_x: x, position_y: y }
        : entry);
    });
  };

  const starters = entries.filter((entry) => entry.is_starter);
  const substitutes = entries.filter((entry) => !entry.is_starter)
    .sort((a, b) => a.bench_order - b.bench_order);
  const playerById = new Map(squad.map((player) => [player.id, player]));
  const selectedPlayer = selectedId ? playerById.get(selectedId) : undefined;
  const selectedEntry = selectedId ? entries.find((entry) => entry.squad_row_id === selectedId) : undefined;
  const previewPlayer = preview ? playerById.get(preview.squadRowId) : undefined;
  const previewEntry = preview ? entries.find((entry) => entry.squad_row_id === preview.squadRowId) : undefined;
  const firstStarter = starters[0];
  const firstSubstitute = substitutes[0];

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeading}>
        <Text style={font.h2}>Starting {Math.min(STARTING_PLAYERS, squad.length)}</Text>
        <Text style={styles.shapeLabel}>1–2–3–1</Text>
      </View>
      <Text style={[font.muted, styles.instructions]}>
        {locked
          ? 'Formation locked until results are finalised. Tap a player for their card.'
          : 'Drag players to rearrange · tap a player for C/V and movement controls'}
      </Text>
      {formationLoadFailed ? (
        <Text style={styles.errorText}>Saved formation unavailable. Showing the current pitch shape.</Text>
      ) : null}

      <View
        ref={pitchRef}
        accessibilityLabel={`Interactive tag rugby pitch with ${starters.length} starters`}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setPitchSize({ width, height });
          measurePitch();
        }}
        style={[styles.pitch, { height: Math.min(600, Math.max(460, (pitchSize.width || 340) * 1.3)) }]}
      >
        <PitchMarkings />
        {starters.map((entry) => {
          const player = playerById.get(entry.squad_row_id);
          return player ? (
            <PitchPlayer
              key={entry.squad_row_id}
              player={player}
              entry={entry}
              locked={locked}
              selected={selectedId === entry.squad_row_id}
              pitchSize={pitchSize}
              onPress={() => setSelectedId(entry.squad_row_id)}
              onMove={(x, y) => movePlayer(entry.squad_row_id, x, y)}
            />
          ) : null;
        })}
        {preview && previewPlayer && previewEntry ? (
          <View
            pointerEvents="none"
            style={[styles.pitchPlayer, styles.previewPlayer, {
              left: `${preview.x * 100}%`,
              top: `${preview.y * 100}%`,
            }]}
          >
            <PlayerToken player={previewPlayer} entry={{ ...previewEntry, is_starter: true }} ghost />
          </View>
        ) : null}
      </View>

      {selectedPlayer && selectedEntry ? (
        <Card style={styles.playerCard}>
          <View style={styles.playerCardHeading}>
            <View style={styles.flex}>
              <Text style={font.h3}>{playerName(selectedPlayer)}</Text>
              <Text style={[font.muted, styles.playerCardMeta]}>
                {selectedPlayer.player.team_name} · {selectedPlayer.player.position} · {formatMoney(selectedPlayer.purchase_price)}
              </Text>
            </View>
            <Text style={styles.selectedRole}>{selectedEntry.is_starter ? 'STARTER' : `SUB ${selectedEntry.bench_order}`}</Text>
          </View>
          <Text style={[font.tiny, styles.captainHint]}>C scores 2×. V covers a captain with no attended match.</Text>
          <View style={styles.buttonRow}>
            <View style={styles.flex}>
              <Button
                title={selectedPlayer.is_captain ? 'Remove C' : 'Make captain'}
                disabled={locked || captainMut.isPending}
                loading={captainMut.isPending && captainMut.variables?.role === 'captain'}
                onPress={() => captainMut.mutate({
                  rowId: selectedPlayer.id,
                  role: 'captain',
                  selected: !selectedPlayer.is_captain,
                })}
              />
            </View>
            <View style={styles.flex}>
              <Button
                title={selectedPlayer.is_vice_captain ? 'Remove V' : 'Make vice'}
                variant="secondary"
                disabled={locked || captainMut.isPending}
                loading={captainMut.isPending && captainMut.variables?.role === 'vice'}
                onPress={() => captainMut.mutate({
                  rowId: selectedPlayer.id,
                  role: 'vice',
                  selected: !selectedPlayer.is_vice_captain,
                })}
              />
            </View>
          </View>
          {selectedEntry.is_starter ? (
            <>
              <Text style={[font.tiny, styles.moveLabel]}>MOVE WITHOUT DRAGGING</Text>
              <View style={styles.nudgeRow}>
                {[
                  { label: '←', x: -0.05, y: 0, name: 'Move left' },
                  { label: '↑', x: 0, y: -0.05, name: 'Move up' },
                  { label: '↓', x: 0, y: 0.05, name: 'Move down' },
                  { label: '→', x: 0.05, y: 0, name: 'Move right' },
                ].map((direction) => (
                  <Pressable
                    key={direction.name}
                    accessibilityRole="button"
                    accessibilityLabel={`${direction.name} ${playerName(selectedPlayer)}`}
                    disabled={locked}
                    onPress={() => movePlayer(
                      selectedPlayer.id,
                      clampPitchCoordinate(selectedEntry.position_x + direction.x),
                      clampPitchCoordinate(selectedEntry.position_y + direction.y),
                    )}
                    style={({ pressed }) => [styles.nudgeButton, (pressed || locked) && styles.nudgeButtonMuted]}
                  >
                    <Text style={styles.nudgeText}>{direction.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {firstSubstitute && selectedEntry.is_starter ? (
            <Button
              title={`Swap with ${playerById.get(firstSubstitute.squad_row_id)?.player.last_name ?? 'substitute'}`}
              variant="secondary"
              disabled={locked}
              onPress={() => changeEntries((current) => swapPlayers(current, selectedPlayer.id, firstSubstitute.squad_row_id))}
            />
          ) : null}
          {!selectedEntry.is_starter ? (
            <Button
              title={firstStarter
                ? `Swap with ${playerById.get(firstStarter.squad_row_id)?.player.last_name ?? 'starter'}`
                : 'Make starter'}
              variant="secondary"
              disabled={locked}
              onPress={() => changeEntries((current) => firstStarter
                ? swapPlayers(current, selectedPlayer.id, firstStarter.squad_row_id)
                : current.map((entry) => entry.squad_row_id === selectedPlayer.id
                  ? { ...entry, is_starter: true, position_x: FORMATION_SLOTS[0].x, position_y: FORMATION_SLOTS[0].y }
                  : entry))}
            />
          ) : null}
          <View style={styles.buttonRow}>
            <View style={styles.flex}>
              <Button title="View profile" variant="ghost" onPress={() => router.push(`/player/${selectedPlayer.player_id}`)} />
            </View>
            <View style={styles.flex}>
              <Button title="Close player card" variant="ghost" onPress={() => setSelectedId(null)} />
            </View>
          </View>
        </Card>
      ) : null}

      <View style={styles.sectionHeading}>
        <Text style={font.h3}>Substitutes</Text>
        <Text style={font.muted}>{substitutes.length} player{substitutes.length === 1 ? '' : 's'}</Text>
      </View>
      {substitutes.length ? (
        <>
          <Text style={[font.tiny, styles.benchHint]}>Drag a substitute onto the pitch to swap with the nearest starter.</Text>
          <View style={styles.bench}>
            {substitutes.map((entry) => {
              const player = playerById.get(entry.squad_row_id);
              return player ? (
                <SubstitutePlayer
                  key={entry.squad_row_id}
                  player={player}
                  entry={entry}
                  locked={locked}
                  selected={selectedId === entry.squad_row_id}
                  getPitchFrame={() => pitchFrame.current}
                  measurePitch={measurePitch}
                  onPress={() => setSelectedId(entry.squad_row_id)}
                  onPreview={setPreview}
                  onDrop={dropSubstitute}
                />
              ) : null;
            })}
          </View>
        </>
      ) : (
        <Text style={[font.muted, styles.emptyBench]}>Add more than seven players to name substitutes.</Text>
      )}

      <Text style={[font.tiny, styles.scoringNote]}>Starting and substitute layout is visual only; existing fantasy scoring is unchanged.</Text>
      {saveMessage ? <Text accessibilityLiveRegion="polite" style={styles.savedText}>{saveMessage}</Text> : null}
      <View style={styles.buttonRow}>
        <View style={styles.flex}>
          <Button
            title="Reset shape"
            variant="ghost"
            disabled={locked || saveMut.isPending}
            onPress={() => changeEntries(() => defaultFormation(squad))}
          />
        </View>
        <View style={styles.flex}>
          <Button
            title={locked ? 'Formation locked' : dirty ? 'Save formation' : 'Formation saved'}
            loading={saveMut.isPending}
            disabled={locked || !dirty || saveMut.isPending}
            onPress={() => saveMut.mutate(entries)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing(4) },
  flex: { flex: 1 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(3),
    marginBottom: spacing(2),
  },
  shapeLabel: { color: colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  instructions: { lineHeight: 19, marginBottom: spacing(3) },
  errorText: { color: colors.warn, fontSize: 13, lineHeight: 18, marginBottom: spacing(2) },
  pitch: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: '#16704B',
  },
  stripe: { position: 'absolute', left: 0, right: 0, height: '10%', backgroundColor: '#197852' },
  stripeAlt: { backgroundColor: '#1B8057' },
  tryZone: { position: 'absolute', left: 0, right: 0, height: '8%', backgroundColor: 'rgba(5,54,36,0.28)' },
  tryZoneTop: { top: 0 },
  tryZoneBottom: { bottom: 0 },
  fieldLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  tryLineTop: { top: '8%' },
  tryLineBottom: { bottom: '8%' },
  halfwayLine: { top: '50%' },
  dashedLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  attackingLine: { top: '28%' },
  defensiveLine: { bottom: '28%' },
  centreMark: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 8,
    height: 8,
    marginLeft: -4,
    marginTop: -4,
    borderRadius: 4,
    backgroundColor: colors.text,
  },
  pitchLabel: { position: 'absolute', color: 'rgba(255,255,255,0.72)', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  attackLabel: { top: '3%', alignSelf: 'center' },
  defendLabel: { bottom: '3%', alignSelf: 'center' },
  halfwayLabel: { top: '51%', right: spacing(2), fontSize: 8 },
  pitchPlayer: {
    position: 'absolute',
    width: 72,
    minHeight: 70,
    transform: [{ translateX: -36 }, { translateY: -35 }],
    zIndex: 2,
  },
  previewPlayer: { zIndex: 4 },
  token: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(7,48,34,0.94)',
  },
  tokenSelected: { borderColor: colors.accent },
  tokenGhost: { opacity: 0.88, borderStyle: 'dashed', borderColor: colors.accent },
  shirt: {
    minWidth: 39,
    height: 27,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
  shirtText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  armband: {
    position: 'absolute',
    right: -8,
    top: -7,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.bg,
  },
  viceArmband: { backgroundColor: '#C7D2D9' },
  armbandText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  playerName: { color: colors.text, fontSize: 11, fontWeight: '700', maxWidth: 66, marginTop: 3 },
  playerMeta: { color: '#D5E8DF', fontSize: 9, maxWidth: 66, marginTop: 1 },
  playerCard: { borderColor: colors.gold, marginTop: spacing(3) },
  playerCardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2) },
  playerCardMeta: { marginTop: spacing(1), lineHeight: 18 },
  selectedRole: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  captainHint: { marginTop: spacing(2), lineHeight: 16 },
  buttonRow: { flexDirection: 'row', gap: spacing(2) },
  moveLabel: { marginTop: spacing(3), marginBottom: spacing(1), letterSpacing: 1 },
  nudgeRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing(2) },
  nudgeButton: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },
  nudgeButtonMuted: { opacity: 0.5 },
  nudgeText: { color: colors.text, fontSize: 23, fontWeight: '600' },
  benchHint: { lineHeight: 16, marginBottom: spacing(2) },
  bench: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  substitute: { flexBasis: '31%', flexGrow: 1, minHeight: 76 },
  substituteActive: { opacity: 0.65 },
  emptyBench: { marginBottom: spacing(3) },
  scoringNote: { textAlign: 'center', lineHeight: 16, marginTop: spacing(3) },
  savedText: { color: colors.accent, fontSize: 13, textAlign: 'center', marginTop: spacing(2) },
  webDragHandle: Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'grab' } as any) : {},
});
