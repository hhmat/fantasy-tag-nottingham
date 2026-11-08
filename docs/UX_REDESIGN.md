# Fantasy Tag Nottingham — Phase 2 UX Redesign

**Goal:** evolve the app from "functional fantasy tool" to a product that *feels* like Fantasy Premier League / Sleeper — while keeping the pitch-green identity, the five-tab skeleton, and every screen that already works.

**Status:** implemented · steps 2.1–2.6 complete

---

## 1. What makes FPL/Sleeper feel the way they do

| Principle | How FPL/Sleeper do it | Our adoption |
|---|---|---|
| **Deadline anxiety** | Countdown everywhere, red when close | Persistent deadline chip on Home + Squad, turns amber < 24 h, red < 2 h |
| **Rank is identity** | Rank movement arrows after every GW | Rank chip with ▲▼ movement on Home + Leagues |
| **One thumb, one hand** | Core actions reachable at bottom | Squad moves to the *centre* tab; primary CTA always bottom-anchored |
| **Players are cards, not rows** | Rich cards with form, price, ownership | PlayerRow 2.0: form dots, price arrows, ownership % |
| **The pitch is the squad** | Squad shown on a pitch graphic | Phase 4 pitch — Phase 2 prepares grouped layout + captain armband |
| **Constant small rewards** | GW points ticker, badges, streaks | GW points hero, POTM badges, "top scorer" ribbon |
| **Personality** | Tone, empty states, microcopy | Tag-rugby voice throughout ("No tags yet", "Sin-binned by the budget") |

## 2. Navigation map

**Current → Proposed** (changes **bold**)

```
Bottom tabs (5, centre elevated):
  Home  ·  Squad  ·  PLAYERS  ·  Fixtures  ·  Leagues
           (centre, larger icon)

Home           → league/[id] (existing) · player/[id] · admin
Squad          → transfers (Squad Builder) · player/[id]
Players        → player/[id] · team/[id]
Fixtures       → **match/[id] (Match Centre — new, Phase 5)**
Leagues        → league/[id]

Modals/routes  transfers · auth/callback · reset-password · admin/*
```

No tab is removed; no route a user has learned moves. **Squad becomes the visual centre** (larger 🏉 icon, FPL-style), because squad management is the game's core loop.

## 3. Onboarding (new — the app's biggest gap)

Today: register → dumped on an empty Squad tab. Proposed 4-step guided flow, shown until the user has a full squad; resumable at any step:

```
Step 1/4  Name your team          Step 2/4  Meet the rules
┌───────────────────────┐         ┌───────────────────────┐
│  ● ○ ○ ○              │         │  ● ● ○ ○              │
│  Your manager name    │         │  £100m budget         │
│  is set, Haytham!     │         │  10 players           │
│                       │         │  Max 2 per real team  │
│  TEAM NAME            │         │  Captain = 2× points  │
│  ┌─────────────────┐  │         │                       │
│  │ Tag You're It   │  │         │  Tries 5 · Assists 3  │
│  └─────────────────┘  │         │  POTM 10 · Win 5      │
│                       │         │                       │
│  [ Continue → ]       │         │  [ Got it → ]         │
└───────────────────────┘         └───────────────────────┘

Step 3/4  Pick your 10            Step 4/4  Join your mates
┌───────────────────────┐         ┌───────────────────────┐
│  ● ● ● ○              │         │  ● ● ● ●              │
│  Opens Squad Builder  │         │  Got a league code    │
│  with tips overlay:   │         │  from your team?      │
│  "Players from 12     │         │  ┌─────────────────┐  │
│  real Beeston teams.  │         │  │  AB12CD         │  │
│  Watch the budget!"   │         │  └─────────────────┘  │
│                       │         │  [ Join ]             │
│  [ Build my squad → ] │         │  [ Skip for now ]     │
└───────────────────────┘         └───────────────────────┘
```

Implementation: `onboarding_step` on `profiles` (0–4, null = done); a lightweight `(onboarding)` route group; Squad tab shows a "Finish setup (2 steps left)" banner until done.

## 4. Screen redesigns

### 4.1 Home — becomes the Gameweek Hub

```
┌─────────────────────────────┐
│ Hi Haytham           🛠 ⚙  │
│ ┌─────────────────────────┐ │
│ │ GW10 · FINALS NIGHT     │ │ ← gameweek hero card
│ │ Deadline Mon 18:30      │ │
│ │ ⏱ Locks in 1d 4h 22m    │ │ ← amber countdown chip
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Trent Taggers       87  │ │ ← team card: pts big,
│ │ #4 ▲2  ·  GW9: 31 pts   │ │   rank + movement
│ └─────────────────────────┘ │
│ ┌─ LIVE ──────────────────┐ │
│ │ RTC 5–6 TEC   2nd half  │ │ ← live strip (realtime),
│ └─────────────────────────┘ │   only during matches
│ Up next                     │
│ ┌─────────────────────────┐ │
│ │ AMT vs RTC · Mon 19:30  │ │
│ └─────────────────────────┘ │
│ Hot this week 🔥            │
│ ┌─────────────────────────┐ │
│ │ S. Brewer ▲£8.7  34 pts │ │ ← price arrow + pts
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

**New elements:** deadline countdown chip, rank movement, GW-points-last-week, live match strip (realtime already wired), price-movement arrows.

### 4.2 Squad — the centre tab

```
┌─────────────────────────────┐
│ Trent Taggers        ✏️     │
│ 87 pts · #4 ▲2 · £2.5m bank │
│ ┌─────────────────────────┐ │
│ │ ⏱ GW10 locks in 1d 4h   │ │ ← lock chip (amber)
│ │ 1 free transfer left    │ │
│ └─────────────────────────┘ │
│ FORWARDS                    │ ← grouped by position
│ ┌─────────────────────────┐ │
│ │◯│ S. Brewer   £8.5  ©⭐│ │ ← © = captain armband
│ │◯│ J. Tagging  £7.0     │ │
│ └─────────────────────────┘ │
│ BACKS                       │
│ ┌─────────────────────────┐ │
│ │◯│ R. Ruck     £6.5  ▲  │ │ ← ▲ price rose this week
│ └─────────────────────────┘ │
│ [ Make transfers (1 free) ] │ ← bottom-anchored CTA
│ Tap a player for captain ·  │
│ long-press for stats        │
└─────────────────────────────┘
```

Phase 4 replaces the grouped lists with the interactive pitch; the grouping, armband and CTA survive.

### 4.3 Squad Builder (transfers) — budget-first

```
┌─────────────────────────────┐
│ Squad Builder          ✕    │
│ £2.5m left · 8/10 picked    │
│ ▓▓▓▓▓▓▓▓░░  budget bar      │ ← visual budget bar
│ ─────────────────────────── │
│ Filter: All Fwd Back Uti £  │
│ ┌─────────────────────────┐ │
│ │◯TTN│ S. Brewer    £8.5m│ │
│ │    │ ●●○ form · 34 pts │ │ ← form dots (last 3 GWs)
│ │    │ 12% owned      [+] │ │ ← ownership % + add
│ └─────────────────────────┘ │
│ Replacing: R. Ruck (£6.5m)  │ ← context bar during
│ [ Cancel swap ]             │   a transfer
└─────────────────────────────┘
```

### 4.4 Players — scouting screen

```
┌─────────────────────────────┐
│ Players                 🔍  │
│ [Search…        ]  Filter ▾ │
│ Sort: Points ▾ Price Form   │
│ ┌─────────────────────────┐ │
│ │◯SHM│ S. Magger   £9.0m │ │
│ │    │ ●●● · 41 pts · ▲  │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```
Player detail `[id]` gains (Phase 5): price-history sparkline, per-GW points bar chart, POTM badges.

### 4.5 Fixtures — with live energy

```
┌─────────────────────────────┐
│ GW1 GW2 … GW9 [GW10]        │ ← chips (existing)
│ ┌─────────────────────────┐ │
│ │ 🔴 LIVE          63'    │ │ ← pulsing live badge
│ │ Rock Tag City   5 – 6   │ │
│ │ Expletive Counters      │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Mon 19:30 · Beeston     │ │
│ │ Ay'up Me Tag!   vs  RTC │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```
Tapping a card opens the Match Centre (`match/[id]`, Phase 5): score, scorers, POTM, player stats table.

### 4.6 Leagues — rank movement everywhere

```
┌─────────────────────────────┐
│ Leagues                     │
│ ┌─────────────────────────┐ │
│ │ Global            #4 ▲2 │ │
│ │ Beeston Socials   #1 —  │ │
│ │ Work League       #3 ▼1 │ │
│ └─────────────────────────┘ │
│ [+ Create]  [Join with code]│
└─────────────────────────────┘
```

## 5. Design tokens 2.0

Keep the existing palette; **add** semantics rather than re-skinning:

```ts
colors.live     = '#FF3D71'   // live badge (replaces danger for LIVE)
colors.warn     = '#FFB300'   // deadline < 24h
colors.rise     = '#4CAF50'   // price/rank up   (existing success)
colors.fall     = '#FF5252'   // price/rank down (existing danger)
colors.gold     = '#FFD54F'   // captain armband, POTM (existing accent)

font.hero = { fontSize: 40, fontWeight: '800' }  // GW points, hero numbers
```

Accessibility floor: contrast of `textMuted #A7C9BB` on `card #135643` ≈ 4.6:1 — passes WCAG AA for body text; `tiny` (11 pt) restricted to labels paired with values.

## 6. Component library (what to build)

| Component | Purpose | New? |
|---|---|---|
| `DeadlineChip` | Countdown chip, grey→amber→red | ✅ |
| `RankBadge` | `#4 ▲2` movement | ✅ |
| `PlayerRow` 2.0 | + form dots, price arrow, ownership | 🔧 upgrade |
| `FormDots` | Last-3-GW ●●○ (pts > 8 = filled) | ✅ |
| `PriceArrow` | ▲▼ from `price_history` | ✅ |
| `BudgetBar` | Squad Builder progress bar | ✅ |
| `LiveStrip` | Realtime live-match banner (Home) | ✅ |
| `ArmbandIcon` | Captain © / POTM ⭐ badges | ✅ |
| `OnboardingShell` | Step dots + resumable flow | ✅ |
| `EmptyState` | exists — add microcopy variants | 🔧 |

## 7. Accessibility & responsiveness standards

- Min touch target 44 × 44 pt everywhere (audit found a few 30 pt toggles in admin).
- Every interactive element: `accessibilityRole` + label; player rows announce "Sam Brewer, Back, Taggingham Forest, £8.5m, 34 points".
- Support Dynamic Type (RN default) — no fixed-height text containers.
- Web: max content width 560 px centred on desktop; tab bar stays bottom on phones, becomes top nav ≥ 768 px (responsive breakpoint in `Screen`).
- All colour-coded info (form, arrows) paired with an icon or text — never colour alone.

## 8. Implementation plan (each step ships independently)

| Step | Deliverable | Effort |
|---|---|---|
| 2.1 | Tokens + DeadlineChip, RankBadge, PriceArrow, FormDots, PlayerRow 2.0 | Small |
| 2.2 | Home → Gameweek Hub (hero card, countdown, live strip) | Medium |
| 2.3 | Squad → grouped layout, armband, lock chip, CTA anchor | Medium |
| 2.4 | Squad Builder budget bar + form/ownership in rows | Medium |
| 2.5 | Onboarding flow (needs `profiles.onboarding_step` — 1-line migration) | Medium |
| 2.6 | Leagues rank movement + a11y pass (touch targets, labels, web breakpoint) | Small |

Phase 3 (avatars/badges/vice-captain), Phase 4 (pitch) and Phase 5 (player/match experience) slot on top — 2.1–2.6 deliberately create the components those phases need.
