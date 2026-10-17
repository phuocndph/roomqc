import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireCronAuth } from '../_shared/cronAuth.ts';
import {
  createSubscriptionJobHandler, runStaffPresenceJob, runSubscriptionStatusJob,
} from '../_shared/subscription-job.ts';

// Internal POST only: CRON_SECRET or service-role bearer, never an anon key.
// Do not enable a schedule before the A1 run-history/outbox and lifecycle review.
const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const client = url && key ? createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
}) : null;

Deno.serve(createSubscriptionJobHandler({
  authorize: requireCronAuth,
  configured: () => client !== null,
  now: () => new Date().toISOString(),
  runId: () => crypto.randomUUID(),
  log: result => console.log(JSON.stringify(result)),
  runSubscription: now => runSubscriptionStatusJob({
    transition: (status, checkedAt) => {
      // Existing predicates/policy preserved. These writes are not atomic with
      // entitlement settlement or notification delivery; see the A1 runbook.
      const query = client!.from('tenants').update({ subscription_status: status, updated_at: checkedAt });
      return status === 'grace_period'
        ? query.lt('subscription_end_date', checkedAt).gte('grace_period_ends_at', checkedAt)
          .in('subscription_status', ['active', 'trial']).select('id, grace_period_ends_at')
        : query.lt('grace_period_ends_at', checkedAt).eq('subscription_status', 'grace_period')
          .select('id, grace_period_ends_at');
    },
    owner: tenantId => client!.from('users').select('id').eq('tenant_id', tenantId)
      .eq('user_level_code', 'tenant_owner').single(),
    notify: notification => client!.from('in_app_notifications').insert(notification),
  }, now),
  runStaffPresence: () => runStaffPresenceJob(() => client!.rpc('auto_offline_inactive_staff')),
}));
