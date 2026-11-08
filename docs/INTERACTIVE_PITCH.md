# Phase 4 — Interactive Try Tag Rugby pitch

The My Squad tab now uses a seven-a-side pitch instead of position-grouped rows. A full ten-player squad has seven starters and three substitutes. Smaller squads use `min(7, squad size)` starters; additional players join the bench.

**Important:** starter/substitute selection is a visual formation feature only. Existing fantasy scoring, captain multipliers, transfers and leaderboards are unchanged.

## Wireframes

### Mobile

```text
┌──────────────────────────────────┐
│ Trent Taggers                  ✏ │
│ 87 pts · #4 · £2.5m bank         │
│ [GW10 deadline] [1 free transfer]│
│                                  │
│ STARTING 7              1–2–3–1  │
│ Drag to rearrange · tap for C/V  │
│ ┌──────────────────────────────┐ │
│ │            ATTACK            │ │
│ │ ───────── TRY LINE ───────── │ │
│ │             [C]              │ │
│ │        [FWD]      [FWD]      │ │
│ │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │ │
│ │ [UTI]      [BACK]      [UTI] │ │
│ │ ───────── HALFWAY ────────── │ │
│ │             [V]              │ │
│ │            DEFEND            │ │
│ └──────────────────────────────┘ │
│ SUBSTITUTES                      │
│ Drag onto pitch to swap nearest  │
│ [SUB 1]      [SUB 2]     [SUB 3] │
│ [Reset shape] [Save formation]   │
│ [Make transfers (1 free)]        │
└──────────────────────────────────┘
```

### Player card

Tap a starter or substitute to open an in-page card rather than a platform-specific alert:

```text
┌──────────────────────────────────┐
│ Sam Brewer               STARTER │
│ Taggingham Forest · Back · £8.5m │
│ C scores 2×; V covers absence    │
│ [Make captain]    [Make vice]    │
│ MOVE WITHOUT DRAGGING            │
│      [←]   [↑]   [↓]   [→]       │
│ [Swap with Taylor]               │
│ [View profile] [Close player card]│
└──────────────────────────────────┘
```

## Interaction model

- **Rearrange starters:** drag a player token anywhere within the safe pitch bounds. Tokens cannot be dragged beyond the try areas or off the pitch.
- **Select a substitute:** drag a bench token onto the pitch. It replaces the nearest starter and adopts the drop coordinates; the displaced starter moves to the bench.
- **No-drag alternative:** every starter has 48 × 48 pt directional controls. Starter/substitute swap buttons use clearly named opponents.
- **Player cards:** tap any token for team, position, purchase price, profile navigation and current starter/substitute status.
- **Captaincy:** C/V actions on the card call the existing `set_captaincy` RPC. The same player cannot hold both roles.
- **Reset:** restores the default 1–2–3–1 shape and bench order as an unsaved draft.
- **Save:** persists the whole formation atomically for the open gameweek. A visible confirmation appears after success.
- **Deadline:** dragging, swapping, resetting, saving and captaincy changes stop at the deadline. Profiles remain accessible.

## Component architecture

```text
app/(tabs)/squad.tsx
└── SquadPitch
    ├── PitchMarkings       Code-drawn striped tag pitch and field lines
    ├── PitchPlayer         Starter token + PanResponder drag handling
    ├── SubstitutePlayer    Bench token + window-coordinate drop detection
    ├── PlayerToken         Team shirt, surname, position and C/V badge
    └── Player Card         C/V, profile, directional movement and swaps

src/lib/formation.ts
├── Default 1–2–3–1 coordinates
├── Saved/current squad merge after transfers
├── Pitch-bound clamping
├── Bench ordering
└── Nearest-starter calculation

src/api/formations.ts
├── getFormation()
└── saveFormation() → save_squad_formation RPC
```

React Native's built-in `PanResponder` handles iOS, Android and web gestures without another native package. Starters use relative `dx`/`dy` movement. Substitute drops use `gestureState.moveX/moveY` with `measureInWindow` so page scrolling and different screen sizes do not distort the target. Web tokens use `touch-action: none` only on the draggable controls; normal page scrolling remains available elsewhere.

## Database

`supabase/migrations/0014_squad_formations.sql` adds:

- `squad_formations`, keyed by fantasy team, gameweek and squad row.
- Seven-a-side coordinates, starter flag and substitute order.
- Owner-only read RLS. No direct client write policy is present.
- `save_squad_formation(...)`, a security-definer RPC that checks:
  - authenticated team ownership;
  - the global squad lock and selected gameweek deadline;
  - a JSON array containing every active squad player exactly once;
  - exactly `min(7, active squad size)` starters;
  - no player from another or inactive squad;
  - coordinate, non-negative bench-order and unique bench-order constraints.

The delete-and-reinsert save runs in one database transaction. Saving one gameweek does not overwrite another. When transfers change the active squad, the client filters out departed players and places new players in a free slot or on the bench; the next save replaces the affected gameweek's draft.

## Apply the migration

1. Apply migrations through `0013_vice_captains.sql` first.
2. Open **Supabase → SQL Editor → New query**.
3. Paste and run the complete `supabase/migrations/0014_squad_formations.sql`.
4. Confirm success before using **Save formation** in the app.

New projects can use the regenerated `supabase/SETUP.sql`, which combines migrations `0001`–`0014` and seed data. Do not run the all-in-one setup on an existing populated project.

The pitch and captain controls remain readable before this migration is applied, but formation persistence requires it. The production migration and RPC were not executed by the client build process.

## Test plan

| Check | Expected behaviour |
| --- | --- |
| Drag a starter | Token follows the gesture and remains inside pitch bounds |
| Tap a starter | Player card opens with correct player data and movement controls |
| Use directional buttons | Token moves by a small increment and Save becomes enabled |
| Make/remove C or V | Existing RPC updates the badge; opposite armband moves rather than duplicates |
| Drag a substitute onto the pitch | Nearest starter is displaced and the substitute appears at the drop point |
| Use a swap button | Named starter and substitute exchange roles |
| Reset shape | Default 1–2–3–1 and bench order return as an unsaved draft |
| Save a valid formation | RPC succeeds and confirmation names the gameweek |
| Reload after saving | Saved coordinates and starter/substitute roles return |
| Save after deadline | UI and server both reject the mutation |
| Submit duplicate/out-of-squad rows | Server rejects the entire formation |
| Transfer a starter out and reload | Departed row disappears; new player fills a free role without affecting other gameweeks |
| Empty/partial squad | Empty state remains; partial squads show up to seven starters and no invalid bench |
| Small and wide screens | Pitch remains within its container; player cards and controls do not cause horizontal scrolling |

Database behaviour, native-device gestures and production save/reload still require testing after the migration is applied.
