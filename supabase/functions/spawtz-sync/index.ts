// ============================================================================
// spawtz-sync — Supabase Edge Function (Deno)
//
// Scrapes the Try Tag Rugby Spawtz pages and syncs into the database:
//   1. Fixtures + results   (Fixtures page + Standings "Results" table)
//   2. Player of the Match  (Statistics page POTM table)
//
// Idempotent: fixtures/teams matched by Spawtz IDs (external_id), stats by
// (fixture_id, player_id). Safe to run every week via pg_cron.
//
// Invoke (POST, service-role bearer): {} or { "dryRun": true }
// Config via env (defaults target Nottingham Beeston Autumn 2026):
//   SPAWTZ_LEAGUE_ID (2246), SPAWTZ_SEASON_ID (100), SPAWTZ_DIVISIONS ("8811,8812")
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const BASE = "https://trytagrugby.spawtz.com/Leagues";
const LEAGUE_ID = Deno.env.get("SPAWTZ_LEAGUE_ID") ?? "2246";
const SEASON_ID = Deno.env.get("SPAWTZ_SEASON_ID") ?? "100";
const DIVISIONS = (Deno.env.get("SPAWTZ_DIVISIONS") ?? "8811,8812").split(",");
const SKIP_TEAMS = /friendly/i; // exhibition opponents are not league teams

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ScrapedFixture {
  externalId: number | null;
  date: string;            // "Monday 09 Nov 2026"
  time: string;            // "19:30"
  venue: string;           // "Pitch A"
  homeName: string;
  awayName: string;
  homeExternalId: number | null;
  awayExternalId: number | null;
  homeScore: number | null;
  awayScore: number | null;
}

interface PomRow {
  playerName: string;
  teamName: string;
  awards: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function splitName(full: string): { first: string; last: string } {
  const parts = norm(full).split(" ");
  if (parts.length === 1) return { first: parts[0], last: "—" };
  let last = parts.slice(1).join(" ");
  if (last === ".") last = parts[0].charAt(0); // Spawtz "Conall ." → "Conall C"
  return { first: parts[0], last };
}

/** UK offset: BST (+01:00) from last Sunday of March to last Sunday of October. */
function londonOffset(y: number, m: number, d: number): string {
  const lastSunday = (year: number, monthIdx: number) => {
    const dt = new Date(Date.UTC(year, monthIdx + 1, 0)); // last day of month
    return dt.getUTCDate() - dt.getUTCDay();
  };
  const start = lastSunday(y, 2); // March
  const end = lastSunday(y, 9);   // October
  const bst = (m === 3 && d >= start) || (m > 3 && m < 10) || (m === 10 && d < end);
  return bst ? "+01:00" : "+00:00";
}

function parseKickoff(dateText: string, time: string): string | null {
  const m = norm(dateText).match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return null;
  const months: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  };
  const month = months[m[2].slice(0, 3)];
  if (!month) return null;
  const day = parseInt(m[1], 10);
  const year = parseInt(m[3], 10);
  const offset = londonOffset(year, month, day);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${time}:00${offset}`;
}

function teamIdFromHref(href: string | null): number | null {
  const m = href?.match(/TeamId=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ---------------------------------------------------------------------------
// Parsers (target Spawtz markup: table.FTable / table.STPOMTable)
// ---------------------------------------------------------------------------
function parseFixtureTables(html: string): ScrapedFixture[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];
  const out: ScrapedFixture[] = [];

  for (const table of doc.querySelectorAll("table.FTable")) {
    let currentDate = "";
    for (const tr of table.querySelectorAll("tr")) {
      if (tr.classList.contains("FHeader")) {
        currentDate = norm(tr.textContent);
        continue;
      }
      const time = tr.querySelector("td.FDate")?.textContent.trim();
      const homeA = tr.querySelector("td.FHomeTeam a");
      const awayA = tr.querySelector("td.FAwayTeam a");
      if (!time || !homeA || !awayA || !currentDate) continue;

      const venue = norm(tr.querySelector("td.FPlayingArea")?.textContent ?? "");
      const scoreText = norm(tr.querySelector("td.FScore")?.textContent ?? "");
      const score = scoreText.match(/^(\d+)\s*-\s*(\d+)$/);
      const fxId = tr.querySelector("[data-fixture-id]")?.getAttribute("data-fixture-id");

      out.push({
        externalId: fxId && fxId !== "" ? parseInt(fxId, 10) : null,
        date: currentDate,
        time,
        venue,
        homeName: norm(homeA.textContent),
        awayName: norm(awayA.textContent),
        homeExternalId: teamIdFromHref(homeA.getAttribute("href")),
        awayExternalId: teamIdFromHref(awayA.getAttribute("href")),
        homeScore: score ? parseInt(score[1], 10) : null,
        awayScore: score ? parseInt(score[2], 10) : null,
      });
    }
  }
  return out;
}

function parsePomTable(html: string): PomRow[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];
  const out: PomRow[] = [];
  for (const tr of doc.querySelectorAll("table.STPOMTable tr")) {
    if (tr.classList.contains("STHeaderRow")) continue;
    const tds = tr.querySelectorAll("td");
    if (tds.length < 3) continue;
    const awards = parseInt(tds[2].textContent.trim(), 10);
    if (isNaN(awards)) continue;
    out.push({
      playerName: norm(tds[0].textContent),
      teamName: norm(tds[1].textContent),
      awards,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Authorised callers: pg_cron (service-role bearer) OR an admin user's JWT
  // (the in-app "Sync now" button). The service-role key never ships in the app.
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  let authorised = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let callerId: string | null = null; // admin user id when JWT-invoked
  if (!authorised && token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();
      authorised = !!prof?.is_admin;
      if (authorised) callerId = user.id;
    }
  }
  if (!authorised) return new Response("unauthorised", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dryRun = !!body.dryRun;

  // 1. Fetch & parse all pages (dedupe across divisions via external_id)
  const fixtureMap = new Map<string, ScrapedFixture>();
  const pomRows: PomRow[] = [];
  const errors: string[] = [];

  for (const div of DIVISIONS) {
    const qs = `VenueId=0&LeagueId=${LEAGUE_ID}&SeasonId=${SEASON_ID}&DivisionId=${div}`;
    for (const page of ["Fixtures", "Standings", "Statistics?Level=Division"]) {
      try {
        const res = await fetch(`${BASE}/${page}?${qs}`, {
          headers: { "User-Agent": "FantasyTagNottingham-Sync/1.0" },
        });
        const html = await res.text();
        if (page.startsWith("Statistics")) {
          pomRows.push(...parsePomTable(html));
        } else {
          for (const f of parseFixtureTables(html)) {
            const key = f.externalId != null
              ? `id:${f.externalId}`
              : `${f.date}|${f.time}|${f.homeName}|${f.awayName}`;
            fixtureMap.set(key, f);
          }
        }
      } catch (e) {
        errors.push(`${page} div ${div}: ${(e as Error).message}`);
      }
    }
  }

  const summary = {
    fixtures_scraped: fixtureMap.size,
    fixtures_upserted: 0,
    teams_created: 0,
    pom_players: pomRows.length,
    pom_awards_applied: 0,
    dry_run: dryRun,
    errors,
  };
  if (dryRun) return Response.json(summary);

  // 2. Team lookup / creation
  const { data: dbTeams } = await supabase.from("teams").select("id, name, external_id");
  const teamByName = new Map((dbTeams ?? []).map((t: any) => [norm(t.name), t.id]));
  const teamByExt = new Map(
    (dbTeams ?? []).filter((t: any) => t.external_id != null).map((t: any) => [t.external_id, t.id]),
  );

  async function ensureTeam(name: string, extId: number | null): Promise<string | null> {
    if (SKIP_TEAMS.test(name)) return null;
    const byName = teamByName.get(name);
    if (byName) return byName;
    if (extId != null && teamByExt.has(extId)) return teamByExt.get(extId)!;

    // New team (e.g. new season joiner): derive a 3-letter code
    const words = name.replace(/[^A-Za-z' ]/g, "").split(" ").filter(Boolean);
    let short = words.map((w) => w[0]).join("").toUpperCase().slice(0, 3) || "TTR";
    const { data: existing } = await supabase.from("teams").select("id").eq("short_name", short);
    if (existing && existing.length > 0) short = short.slice(0, 2) + "X";

    const { data, error } = await supabase
      .from("teams")
      .insert({ name, short_name: short, external_id: extId })
      .select("id")
      .single();
    if (error) {
      errors.push(`team ${name}: ${error.message}`);
      return null;
    }
    teamByName.set(name, data.id);
    if (extId != null) teamByExt.set(extId, data.id);
    summary.teams_created++;
    return data.id;
  }

  // 3. Upsert fixtures
  for (const f of fixtureMap.values()) {
    const homeId = await ensureTeam(f.homeName, f.homeExternalId);
    const awayId = await ensureTeam(f.awayName, f.awayExternalId);
    if (!homeId || !awayId) continue;

    const kickoff = parseKickoff(f.date, f.time);
    if (!kickoff) {
      errors.push(`bad date: ${f.date}`);
      continue;
    }

    const gwDate = kickoff.slice(0, 10);
    const { data: gwId, error: gwErr } = await supabase.rpc("gameweek_for_date", { p_date: gwDate });
    if (gwErr) {
      errors.push(`gameweek ${gwDate}: ${gwErr.message}`);
      continue;
    }

    const status = f.homeScore != null ? "finished" : "scheduled";
    const row = {
      gameweek_id: gwId,
      home_team_id: homeId,
      away_team_id: awayId,
      kickoff,
      venue: f.venue ? `Beeston — ${f.venue}` : null,
      home_score: f.homeScore,
      away_score: f.awayScore,
      status,
      external_id: f.externalId,
    };

    // Match by external_id, else by gameweek + teams
    let query = supabase.from("fixtures").select("id");
    if (f.externalId != null) {
      query = query.eq("external_id", f.externalId);
    } else {
      query = query.eq("gameweek_id", gwId).eq("home_team_id", homeId).eq("away_team_id", awayId);
    }
    const { data: existing } = await query.maybeSingle();

    const { error } = existing
      ? await supabase.from("fixtures").update(row).eq("id", existing.id)
      : await supabase.from("fixtures").insert(row);
    if (error) errors.push(`fixture ${f.homeName} v ${f.awayName}: ${error.message}`);
    else summary.fixtures_upserted++;
  }

  // Win flags on stats rows (fixtures may have been inserted directly as finished)
  await supabase.rpc("sync_win_flags");

  // 4. POTM sync — ensure award counts per player match Spawtz
  for (const row of pomRows) {
    const teamId = teamByName.get(norm(row.teamName));
    if (!teamId) continue; // team skipped (friendly) or unknown

    const { first, last } = splitName(row.playerName);

    // Find or create the player
    let { data: player } = await supabase
      .from("players")
      .select("id")
      .eq("team_id", teamId)
      .ilike("first_name", first)
      .ilike("last_name", last)
      .maybeSingle();

    if (!player) {
      const { data: created, error } = await supabase
        .from("players")
        .insert({ team_id: teamId, first_name: first, last_name: last, position: "Utility", price: 6.5 })
        .select("id")
        .single();
      if (error) {
        errors.push(`player ${row.playerName}: ${error.message}`);
        continue;
      }
      player = created;
    }

    // Current POM count for this player
    const { count } = await supabase
      .from("player_match_stats")
      .select("id", { count: "exact", head: true })
      .eq("player_id", player.id)
      .eq("player_of_match", true);
    const needed = row.awards - (count ?? 0);
    if (needed <= 0) continue;

    // Earliest finished team fixtures where the player has no POM flag
    const { data: fixtures } = await supabase
      .from("fixtures")
      .select("id, home_team_id, away_team_id, home_score, away_score")
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .eq("status", "finished")
      .order("kickoff")
      .limit(50);

    const { data: existingPomRows } = await supabase
      .from("player_match_stats")
      .select("fixture_id")
      .eq("player_id", player.id)
      .eq("player_of_match", true);
    const alreadyPom = new Set((existingPomRows ?? []).map((r: any) => r.fixture_id));

    let applied = 0;
    for (const fx of fixtures ?? []) {
      if (applied >= needed) break;
      if (alreadyPom.has(fx.id)) continue;
      const isHome = fx.home_team_id === teamId;
      const win = fx.home_score !== fx.away_score &&
        (isHome ? fx.home_score > fx.away_score : fx.away_score > fx.home_score);
      const { error } = await supabase.from("player_match_stats").upsert(
        {
          fixture_id: fx.id,
          player_id: player.id,
          player_of_match: true,
          attended: true,
          win,
        },
        { onConflict: "fixture_id,player_id" },
      );
      if (!error) {
        applied++;
        summary.pom_awards_applied++;
      } else {
        errors.push(`pom ${row.playerName}: ${error.message}`);
      }
    }
  }

  }

  // Record the run for the admin dashboard's sync history
  await supabase.from("sync_log").insert({
    triggered_by: callerId,
    fixtures_scraped: summary.fixtures_scraped,
    fixtures_upserted: summary.fixtures_upserted,
    teams_created: summary.teams_created,
    pom_players: summary.pom_players,
    pom_awards_applied: summary.pom_awards_applied,
    error_count: summary.errors.length,
    errors: summary.errors.slice(0, 20),
  });

  // Alert admins by push when a run reports errors
  if (summary.errors.length > 0) {
    const { data: admins } = await supabase
      .from("profiles")
      .select("expo_push_token")
      .eq("is_admin", true)
      .not("expo_push_token", "is", null);

    const messages = (admins ?? [])
      .map((a: any) => a.expo_push_token as string)
      .filter((t) => t.startsWith("ExponentPushToken"))
      .map((to) => ({
        to,
        sound: "default" as const,
        title: "⚠️ Spawtz sync reported errors",
        body: `${summary.errors.length} issue(s) — first: ${summary.errors[0].slice(0, 120)}`,
        data: { screen: "/admin" },
      }));

    if (messages.length > 0) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      }).catch(() => {});
    }
  }

  return Response.json(summary);
});
