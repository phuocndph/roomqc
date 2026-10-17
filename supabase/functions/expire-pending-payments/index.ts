import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCronAuth } from '../_shared/cronAuth.ts'
import { runSubscriptionExpiry } from '../_shared/subscription-expiry.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = requireCronAuth(req, corsHeaders)
  if (denied) return denied

  try {
    console.log("[expire-pending-payments] Starting cleanup job...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const result = await runSubscriptionExpiry(supabase);
    console.log('[expire-pending-payments] Atomic batch completed', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        ...result
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[expire-pending-payments] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
