# Fantasy Tag Nottingham — UI Wireframes

All screens use the dark pitch-green theme (bg `#0B3D2E`, accent yellow `#FFD54F`).
Bottom tab bar: **Home · Squad · Players · Fixtures · Leagues**

---

## 1. Auth — Login `/(auth)/login`

```
┌─────────────────────────────┐
│                             │
│            🏉               │
│   Fantasy Tag Nottingham    │
│  Build your dream tag squad │
│                             │
│  EMAIL                      │
│  ┌───────────────────────┐  │
│  │ you@example.com       │  │
│  └───────────────────────┘  │
│  PASSWORD                   │
│  ┌───────────────────────┐  │
│  │ ••••••••              │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │       Sign in         │  │ ← yellow
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │  Continue with Google │  │
│  └───────────────────────┘  │
│     Forgot password?        │
│  New here? Create account   │
└─────────────────────────────┘
```

Register is the same layout with Display name / Email / Password.

---

## 2. Home `/(tabs)`

```
┌─────────────────────────────┐
│ Welcome back,      🛠 Admin │
│ Haytham            Sign out │
│ ┌─────────────────────────┐ │
│ │ Trent Taggers       🏉  │ │ ← team card
│ │ Global rank #4 · 87 pts │ │
│ │ GW2 deadline: Tue 18:30 │ │
│ └─────────────────────────┘ │
│ Upcoming fixtures           │
│ ┌─────────────────────────┐ │
│ │ TTN vs SHW              │ │
│ │ Tue 19:30 · Forest Rec  │ │
│ └─────────────────────────┘ │
│ Top scorers                 │
│ ┌─────────────────────────┐ │
│ │◯TTN│ Sam Brewer   £8.5m│ │
│ │    │ Back · TTN     34 │ │
│ └─────────────────────────┘ │
│ … (3 rows)                  │
├─────────────────────────────┤
│  🏠     🏉     📊    📅  🏆 │
└─────────────────────────────┘
```

---

## 3. My Squad `/(tabs)/squad`

```
┌─────────────────────────────┐
│ Trent Taggers               │ ← long-press to rename
│ ┌─────┬─────┬─────┬───────┐ │
│ │ 87  │10/10│£3.5m│   1   │ │ ← pts/squad/bank/free transfers
│ │ pts │squad│bank │transf.│ │
│ └─────┴─────┴─────┴───────┘ │
│ ┌─────────────────────────┐ │
│ │  Manage squad/transfers │ │
│ └─────────────────────────┘ │
│ Starting squad              │
│ ┌─────────────────────────┐ │
│ │◯TTN│ Sam Brewer  [C ×2] │ │ ← tap = captain sheet
│ │    │ Back · TTN  £8.5m  │ │
│ └─────────────────────────┘ │
│ … (10 rows)                 │
└─────────────────────────────┘
```

Empty state: 🏉 + "Name your fantasy team" + name input + Create button.

---

## 4. Squad Builder `/transfers` (modal)

```
┌─────────────────────────────┐
│ Squad Builder           ✕   │
│ ┌───────┬────────┬────────┐ │
│ │ 7/10  │ £31.5m │Initial │ │
│ │ squad │remain. │ picks  │ │
│ └───────┴────────┴────────┘ │
│ ┌─────────────────────────┐ │
│ │ Search players…         │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Sam Brewer        £8.5m │ │
│ │ Back · TTN · 34 pts [+] │ │
│ ├─────────────────────────┤ │
│ │ Jo Hartley        £7.0m │ │
│ │ Forward · SHW       [✓] │ │ ← in squad
│ ├─────────────────────────┤ │
│ │ Evie Marsh        £6.0m │ │
│ │ Utility · TTN       [+] │ │ ← greyed if 2 TTN already
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │          Done           │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

Rules enforced live: budget strip turns over-budget adds into alerts;
when squad = 10, "+" prompts "transfer out" picker; no free transfers
left → "−4 pts, continue?".

---

## 5. Players Market `/(tabs)/players`

```
┌─────────────────────────────┐
│ ┌─────────────────────────┐ │
│ │ Search players…         │ │
│ └─────────────────────────┘ │
│ [ALL][TTN][SHW][LML][CAS]▸  │ ← team chips
│ [Points] [Price] [Name]     │ ← sort chips
│ ┌─────────────────────────┐ │
│ │◯TTN│ Sam Brewer   £8.5m │ │
│ │    │ Back · TTN      34 │ │
│ └─────────────────────────┘ │
│ … (scrollable, 150 players) │
└─────────────────────────────┘
```

---

## 6. Player Profile `/player/[id]`

```
┌─────────────────────────────┐
│ ┌─────────────────────────┐ │
│ │        ◯ TTN            │ │
│ │      Sam Brewer         │ │
│ │  Back · Trent Titans    │ │
│ │  [£8.5m] [▲ £0.2m]      │ │
│ └─────────────────────────┘ │
│ Season stats                │
│ ┌────┬────┬────┬────┐       │
│ │ 34 │  4 │  3 │  2 │ …     │ ← Pts/Tries/Assists/Conv/POTM/Wins/Games
│ └────┴────┴────┴────┘       │
│ Price changes               │
│ £8.3m → £8.5m      12 Feb   │
│ Match log                   │
│ GW1 · 2T 1A 0C ⭐      21 pts│
└─────────────────────────────┘
```

Team profile `/team/[id]`: colour banner header + roster rows (same as market rows).

---

## 7. Fixtures `/(tabs)/fixtures`

```
┌─────────────────────────────┐
│ [GW1][GW2][GW3][GW4]▸       │
│ ┌─────────────────────────┐ │
│ │ Tue 10 Feb · Forest Rec │ │
│ │                    LIVE │ │ ← red badge, realtime updates
│ │  Trent Titans [ 3-2 ]   │ │
│ │         Sherwood Stags  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Tue 10 Feb · Wollaton   │ │
│ │                    FT   │ │
│ │  Castle Cav.  [ 4-4 ]   │ │
│ │         Hockley Hawks   │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

---

## 8. Leagues `/(tabs)/leagues`

```
┌─────────────────────────────┐
│ [🌍 Global][📅 Weekly][🔒 Pr]│
│ ┌─────────────────────────┐ │
│ │  1 │ Tag Dynasty    112 │ │
│ │    │ Haytham            │ │
│ ├─────────────────────────┤ │
│ │  4 │ Trent Taggers   87 │ │ ← my row: yellow border
│ │    │ You                │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

Private tab: [Create league] [Join with code] buttons, inline forms,
list of my leagues → tap opens league table `/league/[id]` with
"Leave league" button and the 6-char invite code.

---

## 9. Admin `/admin` (is_admin only)

```
┌─────────────────────────────┐
│ Admin                       │
│ ┌─────────┐ ┌─────────┐     │
│ │  156    │ │   12    │     │ ← counts: players/teams/fixtures/users
│ │ Players │ │ Teams   │     │
│ └─────────┘ └─────────┘     │
│ Manage                      │
│ ┌─────────────────────────┐ │
│ │ 👤 Players & Teams      │ │ → form: team chips, name, position, price
│ ├─────────────────────────┤ │
│ │ 📅 Fixtures             │ │ → GW chips, home/away pickers, date/time
│ │      [Set LIVE][Postpone]│ │
│ ├─────────────────────────┤ │
│ │ ✅ Results & Statistics │ │ → per-fixture: score inputs,
│ └─────────────────────────┘ │    per-player: T/A/C ⭐ ✓ Save
│ Data sync                   │
│ ┌─────────────────────────┐ │
│ │ 🔄 Spawtz sync          │ │ → one-tap scrape of results,
│ │ [      Sync now      ]  │ │   fixtures & POTM + summary
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

Results editor row:

```
│ Sam Brewer   [T_][A_][C_] (⭐)(✓) [Save] │
```
