import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireCronAuth } from '../_shared/cronAuth.ts';
import { createAtomicSubscriptionJobHandler } from '../_shared/subscription-atomic-worker.ts';

// Explicit internal POST body: {"scope":{"kind":"cluster"}} or a nonempty
// tenant allowlist. No scheduler is enabled by this worker cutover.
const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const client = url && key ? createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
}) : null;

Deno.serve(createAtomicSubscriptionJobHandler({
  authorize: requireCronAuth,
  configured: () => client !== null,
  uuid: () => crypto.randomUUID(),
  monotonicNow: () => performance.now(),
  rpc: (name, args) => client!.rpc(name, args).abortSignal(AbortSignal.timeout(10000)),
  log: result => console.log(JSON.stringify(result)),
}));
