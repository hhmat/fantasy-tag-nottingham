# Vice-captains and fallback scoring

Phase 3.2 adds a vice-captain for each gameweek without changing the existing captain multiplier.

## Scoring rule

- The captain (**C**) receives **2× points** when they have at least one attended match in that gameweek.
- If the captain has no statistics row, or every relevant row has `attended = false`, the vice-captain (**V**) receives **2× points** instead.
- A captain who attends any one of multiple fixtures in the gameweek keeps the multiplier. Attendance is aggregated with `bool_or(attended)`.
- If no captain is selected, the vice-captain does **not** independently receive a multiplier.
- If the captain is absent and no vice-captain is selected, nobody receives the captain multiplier.
- Only fixtures belonging to the selected gameweek are considered.
- Live points can move from V to C (or back) while attendance and match statistics are being entered.
- Transfer-hit deductions are unchanged.

Captaincy is stored per gameweek. Editing the open gameweek does not rewrite other gameweeks. Historical gameweeks with no `captain_picks` row retain the legacy `fantasy_team_players.is_captain` fallback introduced in migration `0006`.

## Manager experience

On **My Squad**, tap a player before the deadline to open the captaincy panel. The panel provides:

- Make/remove captain.
- Make/remove vice-captain.
- View player profile.
- Cancel.

C and V armbands appear beside the selected players. Giving a player the opposite armband moves them to the new role and clears their old role, so one player cannot hold both. Captaincy controls remain locked after the gameweek deadline.

Transferring out a captain or vice-captain clears that player's armbands from the affected and future gameweeks. Earlier gameweeks retain their historical picks.

## Database and API

`supabase/migrations/0013_vice_captains.sql`:

- Makes `captain_picks.squad_row_id` nullable so either role can be removed independently.
- Adds `captain_picks.vice_squad_row_id` and a constraint preventing identical C and V rows.
- Updates captain-pick validation for both roles.
- Adds the atomic, authenticated `set_captaincy(...)` RPC, including ownership, active-squad membership, global lock, gameweek deadline, and concurrent-update protection.
- Adds transfer cleanup for inactive captaincy rows.
- Replaces `v_gameweek_points` with attendance-based C/V fallback scoring while preserving transfer hits and legacy history.

The mobile/web API calls this RPC. Before migration `0013` is applied, squad reads gracefully omit vice-captain badges; C/V writes require the migration.

## Apply the migration

1. Ensure `supabase/migrations/0012_manager_and_team_profiles.sql` has already been applied.
2. In Supabase, open **SQL Editor → New query**.
3. Paste the complete contents of `supabase/migrations/0013_vice_captains.sql` and click **Run**.
4. Confirm that the query succeeds before testing C/V changes in the app.

For a new project, `supabase/SETUP.sql` contains migrations `0001`–`0013` plus seed data and can be run instead. Do not run the all-in-one setup over an existing populated project.

## Test matrix

Run these checks against a test squad and test gameweek, not a live scored round:

| Scenario | Expected result |
| --- | --- |
| Captain attends; vice also plays | C receives 2×; V receives normal points |
| Captain has no statistics row | V receives 2× |
| Captain has `attended = false` | V receives 2× |
| No captain selected; vice plays | V receives normal points |
| Captain absent; no vice selected | Nobody receives the captain multiplier |
| Captain attends one of multiple fixtures | C receives 2×; no fallback to V |
| Give C the V armband, or V the C armband | The selected role moves and the old role clears |
| Attempt captaincy changes after the deadline | Change is rejected |
| Transfer out C or V | Armbands clear for affected/future gameweeks; earlier history remains |
| Score a historical gameweek with no `captain_picks` row | Legacy captain behaviour and existing points are preserved |

The migration SQL and production scoring behaviour still need to be exercised in Supabase; client typechecking and export builds do not execute database functions or triggers.
