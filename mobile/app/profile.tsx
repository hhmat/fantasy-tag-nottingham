// Phase 3.1 — manager avatar + fantasy team profile customisation.
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/store/AuthContext';
import { setAvatarUrl, updateProfileDetails } from '@/api/auth';
import { getMyFantasyTeam, setTeamBadgeUrl, updateFantasyTeamProfile } from '@/api/fantasy';
import { removeMedia, uploadMediaBlob, uploadMediaFromUri, type MediaKind } from '@/api/media';
import { ImageCropper } from '@/components/ImageCropper';
import { AVATAR_PRESETS, Avatar, TeamBadge } from '@/components/ProfileImage';
import { Button, Card, Input, Screen, SectionTitle } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';

const TEAM_COLOURS = ['#FFD54F', '#4CAF50', '#1E88E5', '#9C27B0', '#FF5252', '#FFFFFF', '#0B3D2E'];

type CropState = { target: MediaKind; uri: string } | null;

export default function ProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const { data: team } = useQuery({
    queryKey: ['my-team', session?.user.id],
    queryFn: () => getMyFantasyTeam(session!.user.id),
    enabled: !!session,
  });

  const [displayName, setDisplayName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [primary, setPrimary] = useState('#FFD54F');
  const [secondary, setSecondary] = useState('#0B3D2E');
  const [crop, setCrop] = useState<CropState>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setDisplayName(profile?.display_name ?? ''), [profile?.display_name]);
  useEffect(() => {
    setTeamName(team?.name ?? '');
    setDescription(team?.description ?? '');
    setPrimary(team?.primary_color ?? '#FFD54F');
    setSecondary(team?.secondary_color ?? '#0B3D2E');
  }, [team?.id, team?.name, team?.description, team?.primary_color, team?.secondary_color]);

  async function mediaChanged() {
    await refreshProfile();
    qc.invalidateQueries({ queryKey: ['my-team'] });
    qc.invalidateQueries({ queryKey: ['global-board'] });
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      await updateProfileDetails(session!.user.id, displayName.trim());
      if (team) {
        await updateFantasyTeamProfile(team.id, {
          name: teamName.trim(),
          description: description.trim(),
          primary_color: primary,
          secondary_color: secondary,
        });
      }
    },
    onSuccess: async () => {
      await mediaChanged();
      Alert.alert('Profile saved', 'Your manager and team details are up to date.');
    },
    onError: (e: any) => Alert.alert('Could not save profile', e.message),
  });

  async function pickImage(target: MediaKind, camera: boolean) {
    try {
      if (Platform.OS !== 'web') {
        const permission = camera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          return Alert.alert('Permission needed', `Allow ${camera ? 'camera' : 'photo library'} access in Settings.`);
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: Platform.OS !== 'web',
        aspect: [1, 1],
        quality: 0.85,
      };
      const result = camera && Platform.OS !== 'web'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      if (Platform.OS === 'web') {
        setCrop({ target, uri: asset.uri });
        return;
      }
      setBusy(target);
      const compressed = await ImageManipulator.manipulateAsync(asset.uri, [], {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const url = await uploadMediaFromUri(session!.user.id, target, compressed.uri);
      await saveMediaUrl(target, url);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Please try another image.');
    } finally {
      setBusy(null);
    }
  }

  async function saveMediaUrl(target: MediaKind, url: string | null) {
    if (target === 'avatar') await setAvatarUrl(session!.user.id, url);
    else if (team) await setTeamBadgeUrl(team.id, url);
    else throw new Error('Create your fantasy team before adding a badge.');
    await mediaChanged();
  }

  async function removeImage(target: MediaKind) {
    setBusy(`remove-${target}`);
    try {
      await saveMediaUrl(target, null);
      // The public URL is removed first; stale storage cleanup is best-effort.
      await removeMedia(session!.user.id, target).catch(() => {});
    } catch (e: any) {
      Alert.alert('Could not remove image', e.message);
    } finally {
      setBusy(null);
    }
  }

  async function choosePreset(value: string) {
    setBusy('preset');
    try {
      await saveMediaUrl('avatar', value);
      if (profile?.avatar_url && !profile.avatar_url.startsWith('preset:')) {
        await removeMedia(session!.user.id, 'avatar').catch(() => {});
      }
    } catch (e: any) {
      Alert.alert('Could not choose avatar', e.message);
    } finally {
      setBusy(null);
    }
  }

  if (crop) {
    return (
      <Screen>
        <SectionTitle>Crop your {crop.target === 'avatar' ? 'avatar' : 'team badge'}</SectionTitle>
        <ImageCropper
          image={crop.uri}
          onCancel={() => setCrop(null)}
          onComplete={async (blob) => {
            setBusy(crop.target);
            try {
              const url = await uploadMediaBlob(session!.user.id, crop.target, blob);
              await saveMediaUrl(crop.target, url);
              setCrop(null);
            } catch (e: any) {
              Alert.alert('Upload failed', e?.message ?? 'Please try another image.');
              throw e;
            } finally {
              setBusy(null);
            }
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionTitle>Manager profile</SectionTitle>
      <Card style={styles.centredCard}>
        <Avatar value={profile?.avatar_url} name={displayName || 'Manager'} size={96} />
        <Text style={[font.h2, styles.previewName]}>{displayName || 'Manager'}</Text>
        <View style={styles.buttonRow}>
          <View style={styles.flex}>
            <Button
              title="Upload photo"
              variant="secondary"
              loading={busy === 'avatar'}
              onPress={() => pickImage('avatar', false)}
            />
          </View>
          {Platform.OS !== 'web' ? (
            <View style={styles.flex}>
              <Button title="Camera" variant="ghost" onPress={() => pickImage('avatar', true)} />
            </View>
          ) : null}
        </View>
        <Text style={styles.galleryLabel}>OR PICK AN AVATAR</Text>
        <View style={styles.gallery}>
          {AVATAR_PRESETS.map((preset) => (
            <Pressable
              key={preset.value}
              onPress={() => choosePreset(preset.value)}
              disabled={busy !== null}
              style={({ pressed }) => [
                styles.presetButton,
                profile?.avatar_url === preset.value && styles.presetSelected,
                pressed && { opacity: 0.65 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Use ${preset.label} avatar`}
              accessibilityState={{ selected: profile?.avatar_url === preset.value, disabled: busy !== null }}
            >
              <Avatar value={preset.value} name={preset.label} size={52} />
            </Pressable>
          ))}
        </View>
        {profile?.avatar_url ? (
          <Button
            title="Remove avatar"
            variant="ghost"
            loading={busy === 'remove-avatar'}
            onPress={() => removeImage('avatar')}
          />
        ) : null}
      </Card>
      <Input
        label="MANAGER NAME"
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={40}
        placeholder="Your manager name"
      />

      <SectionTitle>Fantasy team profile</SectionTitle>
      {team ? (
        <>
          <Card style={styles.centredCard}>
            <TeamBadge
              value={team.badge_url}
              name={teamName || team.name}
              primaryColor={primary}
              secondaryColor={secondary}
              size={104}
            />
            <Text style={[font.h2, styles.previewName]} numberOfLines={2}>{teamName || team.name}</Text>
            {description ? <Text style={styles.descriptionPreview}>{description}</Text> : null}
            <Button
              title="Upload team badge"
              variant="secondary"
              loading={busy === 'badge'}
              onPress={() => pickImage('badge', false)}
            />
            {team.badge_url ? (
              <Button
                title="Remove team badge"
                variant="ghost"
                loading={busy === 'remove-badge'}
                onPress={() => removeImage('badge')}
              />
            ) : null}
          </Card>
          <Input label="TEAM NAME" value={teamName} onChangeText={setTeamName} maxLength={40} />
          <Input
            label="TEAM DESCRIPTION"
            value={description}
            onChangeText={setDescription}
            maxLength={160}
            multiline
            placeholder="A little about your team…"
            style={styles.descriptionInput}
          />
          <Text style={styles.characterCount}>{description.length}/160</Text>
          <ColourPicker label="PRIMARY COLOUR" value={primary} onChange={setPrimary} />
          <ColourPicker label="SECONDARY COLOUR" value={secondary} onChange={setSecondary} />
        </>
      ) : (
        <Card>
          <Text style={font.muted}>Create your fantasy team first, then come back to add its badge and colours.</Text>
        </Card>
      )}

      <Button
        title="Save profile"
        loading={saveMut.isPending}
        onPress={() => {
          if (displayName.trim().length < 2) return Alert.alert('Manager name must be at least 2 characters.');
          if (team && teamName.trim().length < 2) return Alert.alert('Team name must be at least 2 characters.');
          saveMut.mutate();
        }}
      />
    </Screen>
  );
}

function ColourPicker({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (colour: string) => void;
}) {
  return (
    <View style={styles.colourSection}>
      <Text style={font.tiny}>{label}</Text>
      <View style={styles.colourRow}>
        {TEAM_COLOURS.map((colour) => (
          <Pressable
            key={colour}
            onPress={() => onChange(colour)}
            style={[styles.colour, { backgroundColor: colour }, value === colour && styles.colourSelected]}
            accessibilityRole="button"
            accessibilityLabel={`${label.toLowerCase()} ${colour}`}
            accessibilityState={{ selected: value === colour }}
          >
            {value === colour ? <Text style={{ color: colour === '#FFFFFF' || colour === '#FFD54F' ? '#0B3D2E' : '#FFFFFF' }}>✓</Text> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centredCard: { alignItems: 'center' },
  previewName: { marginTop: spacing(3), textAlign: 'center' },
  descriptionPreview: { ...font.muted, textAlign: 'center', marginTop: spacing(2) },
  buttonRow: { flexDirection: 'row', alignSelf: 'stretch', gap: spacing(2) },
  galleryLabel: { ...font.tiny, marginTop: spacing(4), marginBottom: spacing(2) },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing(2) },
  presetButton: {
    minWidth: 60,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetSelected: { borderColor: colors.accent, backgroundColor: colors.cardAlt },
  descriptionInput: { minHeight: 100, textAlignVertical: 'top' },
  characterCount: { ...font.tiny, textAlign: 'right', marginTop: -spacing(2), marginBottom: spacing(3) },
  colourSection: { marginBottom: spacing(3) },
  colourRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginTop: spacing(2) },
  colour: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colourSelected: { borderColor: colors.accent, borderWidth: 4 },
});
