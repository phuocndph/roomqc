import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')?.trim()
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = Deno.env.get('CAMPAIGN_FROM_EMAIL') || 'no-reply@roomqc.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Body {
  campaign_id: string
}

async function sendViaResend(to: string, subject: string, html: string): Promise<string | undefined> {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text}`)
  try {
    const j = JSON.parse(text)
    return j?.id ?? j?.data?.id
  } catch {
    return undefined
  }
}

function renderTemplate(tpl: string | null, ctx: Record<string, unknown>): string {
  const base = tpl || '<p>{{banner_text}}</p>'
  return base.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(ctx[k] ?? ''))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Require super_admin
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: claims, error: claimsErr } = await adminClient.auth.getClaims(token)
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: isSA } = await adminClient.rpc('is_super_admin', { p_user_id: claims.claims.sub })
    if (!isSA) {
      return new Response(JSON.stringify({ error: 'Forbidden: super_admin required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { campaign_id } = (await req.json()) as Body
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: 'campaign_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

    const { data: campaign, error: cErr } = await supabase
      .from('marketing_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single()
    if (cErr || !campaign) throw new Error(cErr?.message || 'Campaign not found')

    // Build tenant query based on target_audience
    let tq = supabase.from('tenants').select('id, name, email, subscription_status, subscription_plan')
    switch (campaign.target_audience) {
      case 'active':
        tq = tq.eq('subscription_status', 'active'); break
      case 'trial':
        tq = tq.eq('subscription_status', 'trial'); break
      case 'cancelled':
        tq = tq.in('subscription_status', ['cancelled', 'expired', 'suspended']); break
      case 'specific_plans':
        if (Array.isArray(campaign.target_plan_codes) && campaign.target_plan_codes.length) {
          tq = tq.in('subscription_plan', campaign.target_plan_codes)
        }
        break
      case 'all':
      default:
        break
    }

    const { data: tenants, error: tErr } = await tq
    if (tErr) throw tErr

    const recipients = (tenants || []).filter((t) => t.email)
    let sent = 0
    let failed = 0

    for (const t of recipients) {
      // Upsert engagement row
      const { data: eng } = await supabase
        .from('campaign_engagement')
        .upsert(
          { campaign_id, tenant_id: t.id, email_sent_at: new Date().toISOString() },
          { onConflict: 'campaign_id,tenant_id' }
        )
        .select('id')
        .single()

      try {
        const html = renderTemplate(campaign.email_template, {
          tenant_name: t.name,
          banner_text: campaign.banner_text,
          cta_text: campaign.cta_text,
          cta_link: campaign.cta_link,
        })
        await sendViaResend(t.email!, campaign.email_subject || campaign.name, html)
        sent++
      } catch (err) {
        failed++
        console.error('[launch-campaign] send failed', t.email, err)
        if (eng?.id) {
          await supabase
            .from('campaign_engagement')
            .update({ email_sent_at: null })
            .eq('id', eng.id)
        }
      }
    }

    await supabase
      .from('marketing_campaigns')
      .update({
        status: 'active',
        sent_at: new Date().toISOString(),
        emails_sent: (campaign.emails_sent || 0) + sent,
      })
      .eq('id', campaign_id)

    return new Response(
      JSON.stringify({ ok: true, total: recipients.length, sent, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('[launch-campaign] error', err)
    return new Response(JSON.stringify({ error: err?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
