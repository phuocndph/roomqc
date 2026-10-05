// One-shot admin tool to inject x-cron-secret header into pg_cron jobs
// that call edge functions protected by requireCronAuth.
//
// Usage (super_admin only):
//   POST /functions/v1/setup-cron-auth
//   Authorization: Bearer <user JWT for a super_admin>

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

// Cron jobs that hit functions protected by requireCronAuth.
// jobname -> { url, body }
const PROTECTED_JOBS: Record<string, { url: string; body: string }> = {
  "expire-pending-payments-hourly": {
    url: `${SUPABASE_URL}/functions/v1/expire-pending-payments`,
    body: `'{}'::jsonb`,
  },
  "cleanup-stale-room-check-sessions": {
    url: `${SUPABASE_URL}/functions/v1/cleanup-sessions`,
    body: `'{}'::jsonb`,
  },
  "lift-expired-dnd-oos-every-5min": {
    url: `${SUPABASE_URL}/functions/v1/lift-expired-dnd-oos`,
    body: `jsonb_build_object('triggered_at', now())`,
  },
  "laundry-compensation-cron-6h": {
    url: `${SUPABASE_URL}/functions/v1/laundry-compensation-cron`,
    body: `jsonb_build_object('time', now()::text)`,
  },
  "dead-stock-digest-weekly": {
    url: `${SUPABASE_URL}/functions/v1/dead-stock-digest`,
    body: `'{}'::jsonb`,
  },
  "process-room-check-outbox-every-minute": {
    url: `${SUPABASE_URL}/functions/v1/process-room-check-outbox`,
    body: `jsonb_build_object('triggered_at', now())`,
  },
  "reconcile-room-check-side-effects-6h": {
    url: `${SUPABASE_URL}/functions/v1/reconcile-room-check-side-effects`,
    body: `jsonb_build_object('source','cron','at', now()::text)`,
  },
};

function buildCommand(url: string, body: string, secret: string): string {
  // Keep apikey (so PostgREST accepts) AND add x-cron-secret for app-level auth.
  const headers = {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    "x-cron-secret": secret,
  };
  return `
  SELECT net.http_post(
    url := '${url}',
    headers := '${JSON.stringify(headers)}'::jsonb,
    body := ${body}
  );
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!CRON_SECRET) {
      return new Response(JSON.stringify({ error: "CRON_SECRET not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify super_admin caller
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: userData.user.id });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ job: string; ok: boolean; error?: string }> = [];
    for (const [jobname, { url, body }] of Object.entries(PROTECTED_JOBS)) {
      const command = buildCommand(url, body, CRON_SECRET);
      // cron.schedule(jobname, schedule, command) updates command if name exists
      const { error } = await admin.rpc("exec_cron_update", {
        _jobname: jobname,
        _command: command,
      });
      results.push({ job: jobname, ok: !error, error: error?.message });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
