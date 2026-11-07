// ============================================================================
// weekly-reminders — Supabase Edge Function (Deno)
// Sends push notifications via the Expo Push API.
//
// Invoke modes (POST body):
//   { "kind": "gameweek_preview", "gameweek": 2 }
//   { "kind": "deadline",         "gameweek": 2 }
//
// Schedule with pg_cron (see docs/DEPLOYMENT.md §6).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushMessage {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  // Only allow calls carrying the service-role secret (pg_cron / dashboard)
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("unauthorised", { status: 401 });
  }

  const { kind, gameweek } = await req.json();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: gw } = await supabase
    .from("gameweeks")
    .select("id, name, deadline")
    .eq("id", gameweek)
    .single();

  if (!gw) return new Response("gameweek not found", { status: 404 });

  const deadline = new Date(gw.deadline).toLocaleString("en-GB", {
    weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  });

  const copy: Record<string, { title: string; body: string; screen: string }> = {
    gameweek_preview: {
      title: `🏉 ${gw.name} is coming up`,
      body: "Check the fixtures, review your squad and pick your captain.",
      screen: "/(tabs)/fixtures",
    },
    deadline: {
      title: `⏰ ${gw.name} deadline soon`,
      body: `Squad locks at ${deadline}. Make your transfers now!`,
      screen: "/(tabs)/squad",
    },
  };

  const message = copy[kind];
  if (!message) return new Response("unknown kind", { status: 400 });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("expo_push_token")
    .not("expo_push_token", "is", null);

  const tokens = (profiles ?? [])
    .map((p) => p.expo_push_token as string)
    .filter((t) => t.startsWith("ExponentPushToken"));

  // Expo accepts batches of up to 100 messages
  const batches: PushMessage[][] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    batches.push(
      tokens.slice(i, i + 100).map((to) => ({
        to,
        sound: "default",
        title: message.title,
        body: message.body,
        data: { gameweek, screen: message.screen },
      })),
    );
  }

  let sent = 0;
  for (const batch of batches) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (res.ok) sent += batch.length;
  }

  return Response.json({ kind, gameweek, targeted: tokens.length, sent });
});
