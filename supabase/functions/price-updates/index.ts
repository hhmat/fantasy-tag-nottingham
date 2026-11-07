// ============================================================================
// price-updates — Supabase Edge Function (Deno)
// Applies gameweek price changes by calling the apply_price_changes() SQL fn.
//
// Invoke (POST body): { "gameweek": 2 }
// Schedule with pg_cron after each gameweek deadline (docs/DEPLOYMENT.md §6).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("unauthorised", { status: 401 });
  }

  const { gameweek } = await req.json();
  if (typeof gameweek !== "number") {
    return new Response("gameweek required", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc("apply_price_changes", {
    p_gameweek: gameweek,
  });

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ gameweek, prices_changed: data });
});
