# Fantasy Tag Nottingham

A complete fantasy sports app for a Try Tag Rugby league — 12 teams, ~150 players, £100m budget, 10-player squads, captain double points, live fixtures, private leagues and an in-app admin dashboard.

## Repository layout

```
.
├── docs/
│   ├── ARCHITECTURE.md        # Full system architecture
│   ├── WIREFRAMES.md          # UI wireframes for every screen
│   ├── DEPLOYMENT.md          # Supabase + EAS deployment instructions
│   └── LAUNCH_CHECKLIST.md    # Finals Night go-live runbook
├── supabase/
│   ├── migrations/
│   │   ├── 0001_schema.sql     # Tables, enums, indexes
│   │   ├── 0002_rls.sql        # Row Level Security policies
│   │   └── 0003_functions.sql  # Scoring, squad validation, price changes, views
│   ├── seed.sql                # Real Beeston Autumn 2026 season + players
│   └── functions/
│       ├── weekly-reminders/   # Push notifications (weekly + deadline)
│       ├── price-updates/      # Nightly price-change engine
│       └── spawtz-sync/        # Scrapes Spawtz: results, fixtures, POTM
├── scraper/                    # Parser regression test + saved page samples
└── mobile/                   # React Native (Expo) + TypeScript app
    ├── app/                  # expo-router screens
    └── src/
        ├── api/              # Data-access layer over Supabase
        ├── components/       # Shared UI components
        ├── lib/              # supabase client, notifications, scoring helpers
        ├── store/            # AuthContext
        ├── theme/            # Colours, spacing, typography
        └── types/            # Shared TypeScript types
```

## Quick start

1. Create a Supabase project, run the three migrations then `seed.sql` (see `docs/DEPLOYMENT.md`).
2. `cd mobile && cp .env.example .env` and fill in your Supabase URL + anon key.
3. `npm install && npx expo start` — run on iOS/Android via Expo Go or a dev build.

## Scoring

| Event            | Points |
| ---------------- | ------ |
| Try              | 5      |
| Assist           | 3      |
| Conversion       | 2      |
| Player of Match  | 10     |
| Win bonus        | 5      |
| Attendance       | 1      |
| Captain          | × 2    |

## Rules

- £100m budget, 10 players per fantasy squad.
- Maximum 2 players from any single real team.
- 1 free transfer per gameweek; additional transfers cost −4 points each.
- Squads lock at the gameweek deadline.
