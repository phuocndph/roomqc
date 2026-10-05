import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireCronAuth } from '../_shared/cronAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Cron job to check and update subscription statuses
 * 
 * This function should be called periodically (e.g., every hour) to:
 * 1. Mark expired subscriptions as 'grace_period'
 * 2. Mark grace period expired subscriptions as 'suspended'
 * 
 * To set up the cron job, run this SQL:
 * 
 * SELECT cron.schedule(
 *   'check-subscription-status',
 *   '0 * * * *', -- Every hour
 *   $$
 *   SELECT net.http_post(
 *     url:='https://<project-ref>.supabase.co/functions/v1/check-subscription-status',
 *     headers:='{"Content-Type": "application/json", "Authorization": "Bearer <anon_key>"}'::jsonb,
 *     body:='{}'::jsonb
 *   ) as request_id;
 *   $$
 * );
 */

Deno.serve(async (req) => {
  console.log('=== Check Subscription Status Cron Job ===');
  console.log('Time:', new Date().toISOString());

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = requireCronAuth(req, corsHeaders)
  if (denied) return denied

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const now = new Date().toISOString();

    // 0. Auto-offline inactive staff (last_seen > 30 min ago)
    const { error: offlineError } = await supabase.rpc('auto_offline_inactive_staff');
    if (offlineError) {
      console.error('Error auto-offlining inactive staff:', offlineError);
    } else {
      console.log('Auto-offline check completed');
    }
    
    // 1. Mark active subscriptions that have expired as 'grace_period'
    const { data: toGracePeriod, error: graceError } = await supabase
      .from('tenants')
      .update({ 
        subscription_status: 'grace_period',
        updated_at: now
      })
      .lt('subscription_end_date', now)
      .gte('grace_period_ends_at', now)
      .in('subscription_status', ['active', 'trial'])
      .select('id, name, subscription_end_date, grace_period_ends_at');

    if (graceError) {
      console.error('Error updating to grace_period:', graceError);
    } else {
      console.log(`Marked ${toGracePeriod?.length || 0} tenants as grace_period`);
      if (toGracePeriod && toGracePeriod.length > 0) {
        toGracePeriod.forEach(t => {
          console.log(`  - ${t.name} (${t.id}): expired ${t.subscription_end_date}, grace until ${t.grace_period_ends_at}`);
        });
      }
    }

    // 2. Mark grace_period subscriptions that have fully expired as 'suspended'
    const { data: toSuspended, error: suspendError } = await supabase
      .from('tenants')
      .update({ 
        subscription_status: 'suspended',
        updated_at: now
      })
      .lt('grace_period_ends_at', now)
      .eq('subscription_status', 'grace_period')
      .select('id, name, subscription_end_date, grace_period_ends_at');

    if (suspendError) {
      console.error('Error updating to suspended:', suspendError);
    } else {
      console.log(`Marked ${toSuspended?.length || 0} tenants as suspended`);
      if (toSuspended && toSuspended.length > 0) {
        toSuspended.forEach(t => {
          console.log(`  - ${t.name} (${t.id}): grace ended ${t.grace_period_ends_at}`);
        });
      }
    }

    // 3. Create notifications for tenants entering grace period
    if (toGracePeriod && toGracePeriod.length > 0) {
      for (const tenant of toGracePeriod) {
        // Get tenant owner
        const { data: owner } = await supabase
          .from('users')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('user_level_code', 'tenant_owner')
          .single();

        if (owner) {
          await supabase.from('in_app_notifications').insert({
            user_id: owner.id,
            tenant_id: tenant.id,
            title: 'Gói đăng ký đã hết hạn',
            body: 'Gói đăng ký của bạn đã hết hạn. Bạn còn 7 ngày để gia hạn trước khi tài khoản bị tạm ngưng.',
            type: 'subscription',
            action_url: '/settings/subscription',
            icon: 'AlertTriangle'
          });
        }
      }
    }

    // 4. Create notifications for tenants being suspended
    if (toSuspended && toSuspended.length > 0) {
      for (const tenant of toSuspended) {
        const { data: owner } = await supabase
          .from('users')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('user_level_code', 'tenant_owner')
          .single();

        if (owner) {
          await supabase.from('in_app_notifications').insert({
            user_id: owner.id,
            tenant_id: tenant.id,
            title: 'Tài khoản đã bị tạm ngưng',
            body: 'Thời gian gia hạn đã hết. Tài khoản của bạn đã bị tạm ngưng. Vui lòng gia hạn để tiếp tục sử dụng.',
            type: 'subscription',
            action_url: '/settings/subscription',
            icon: 'AlertTriangle'
          });
        }
      }
    }

    const summary = {
      checked_at: now,
      to_grace_period: toGracePeriod?.length || 0,
      to_suspended: toSuspended?.length || 0
    };

    console.log('Summary:', JSON.stringify(summary));

    return new Response(
      JSON.stringify({ success: true, ...summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Cron job error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
