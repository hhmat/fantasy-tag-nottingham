# Phase 3.1 — Manager & Team Profiles

## Delivered UI

The Home avatar opens `/profile`.

```text
Manager profile
┌─────────────────────────────┐
│        [ avatar ]           │
│       Manager name          │
│  [ Upload photo ] [Camera]  │  Camera appears on native iOS/Android
│  OR PICK AN AVATAR          │
│  🏉   🚀   🦁   🦊   ⚡   🏆  │
│  [ Remove avatar ]          │
└─────────────────────────────┘
Manager name

Fantasy team profile
┌─────────────────────────────┐
│       [ team badge ]        │
│         Team name           │
│      Team description       │
│    [ Upload team badge ]    │
└─────────────────────────────┘
Team name · description (160 chars)
Primary colour · secondary colour
[ Save profile ]
```

- Native photo selection and camera use the operating system square cropper.
- Web photo selection opens an interactive drag/pinch/zoom cropper.
- Native images are converted to compressed JPEG before upload.
- Preset avatars need no storage and work immediately after `profiles.avatar_url` is writable.
- Uploaded images are limited to 5 MB and cached URLs are versioned on replacement.

## Database changes

`supabase/migrations/0012_manager_and_team_profiles.sql` adds:

| Object | Change |
|---|---|
| `fantasy_teams.badge_url` | Nullable public image URL |
| `fantasy_teams.primary_color` | Hex colour, default `#FFD54F` |
| `fantasy_teams.secondary_color` | Hex colour, default `#0B3D2E` |
| `fantasy_teams.description` | Up to 160 characters |
| `storage` bucket `avatars` | Public reads, JPEG only, 5 MB maximum |
| Storage RLS | Authenticated users can write only inside their own `<auth.uid>/` folder |

Manager avatars use the existing `profiles.avatar_url` column. No scoring, squad, fixture, or leaderboard tables are changed.

## Supabase setup

1. Open **Supabase → SQL Editor → New query**.
2. Paste and run `supabase/migrations/0012_manager_and_team_profiles.sql`.
3. Open **Storage** and confirm the `avatars` bucket exists.
4. No new CLI access token or Edge Function deployment is required.

For a new Supabase project, `supabase/SETUP.sql` includes this migration after `0011` and before the seed data.

## Native build notes

`expo-image-picker` and `expo-image-manipulator` are native modules. Create a new EAS development/production build after this update so the camera and compression native code is included. The existing web deployment needs no native build.

## Verification plan

- Save manager name, team name, description, and both colours; reload and confirm persistence.
- Choose each preset avatar; remove it; confirm initials return.
- Upload a photo on web, reposition and zoom the crop, save, then replace it and confirm the new image appears immediately.
- On iOS and Android, test gallery and camera permissions, square cropping, upload, and removal.
- While signed in as a different user, attempt to overwrite another user's `<uid>/avatar` object; storage RLS must reject it.
- Confirm images larger than 5 MB and non-JPEG storage uploads are rejected.
