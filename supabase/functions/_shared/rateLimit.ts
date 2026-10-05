// Shared rate-limit helper for edge functions.
// Uses public.check_rate_limit RPC backed by rate_limit_hits table.
// Keep ad-hoc and minimal — backend has no formal rate-limit primitive yet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface RateLimitOptions {
  /** Stable identifier for the bucket, e.g. `password-reset:${email}` */
  key: string;
  /** Max hits allowed in window */
  max: number;
  /** Window length in seconds */
  windowSeconds: number;
}

let _client: ReturnType<typeof createClient> | null = null;
function getServiceClient() {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

/**
 * Returns true if request is allowed. Returns false if rate exceeded.
 * On internal errors, fails OPEN (returns true) to avoid locking users out
 * if DB has hiccups — log the error so it can be investigated.
 */
export async function checkRateLimit(opts: RateLimitOptions): Promise<boolean> {
  try {
    const sb = getServiceClient();
    const { data, error } = await sb.rpc("check_rate_limit", {
      _bucket_key: opts.key,
      _max_hits: opts.max,
      _window_seconds: opts.windowSeconds,
    });
    if (error) {
      console.error("[rateLimit] RPC error", error);
      return true; // fail open
    }
    return data === true;
  } catch (e) {
    console.error("[rateLimit] exception", e);
    return true;
  }
}

/** Standard 429 response body */
export function rateLimitedResponse(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({
      error: "RATE_LIMITED",
      message: "Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.",
    }),
    {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
