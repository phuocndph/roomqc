// Weekly dead-stock email digest
// Triggered by cron (Mondays 08:00 ICT). Sends one email per recipient
// (owners + hotel_managers with email_dead_stock_digest = true) with the
// list of dead-stock items (≥ 90 days idle) for their tenant.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireCronAuth } from '../_shared/cronAuth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')?.trim()
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function fmtVnd(n: number) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫'
}

async function sendResend(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY missing')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Hotel Asset Manager <noreply@resend.dev>',
      to: [to],
      subject,
      html,
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text}`)
  return text
}

function buildHtml(tenantName: string, rows: any[], totalValue: number) {
  const list = rows
    .slice(0, 50)
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${r.item_code ?? ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${r.item_name ?? ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${r.quantity_in_stock ?? 0}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmtVnd(Number(r.total_value || 0))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#999;font-size:12px">${r.last_outbound_at ?? 'Chưa từng xuất'}</td>
      </tr>`,
    )
    .join('')
  return `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#222">
    <h2 style="color:#b45309">Báo cáo tồn ứ đọng tuần</h2>
    <p>Khách sạn <strong>${tenantName}</strong> hiện có <strong>${rows.length}</strong> mặt hàng không xuất kho ≥ 90 ngày, tổng giá trị tồn <strong>${fmtVnd(totalValue)}</strong>.</p>
    <table style="border-collapse:collapse;width:100%;margin-top:12px">
      <thead>
        <tr style="background:#fafafa;text-align:left">
          <th style="padding:6px 8px;border-bottom:2px solid #ddd">Mã</th>
          <th style="padding:6px 8px;border-bottom:2px solid #ddd">Tên hàng</th>
          <th style="padding:6px 8px;border-bottom:2px solid #ddd;text-align:right">Tồn</th>
          <th style="padding:6px 8px;border-bottom:2px solid #ddd;text-align:right">Giá trị</th>
          <th style="padding:6px 8px;border-bottom:2px solid #ddd">Lần xuất cuối</th>
        </tr>
      </thead>
      <tbody>${list}</tbody>
    </table>
    ${rows.length > 50 ? `<p style="color:#999;font-size:12px">… và ${rows.length - 50} mặt hàng khác.</p>` : ''}
    <p style="margin-top:18px;font-size:13px;color:#555">
      Mở mục <em>Kho → Tồn ứ đọng</em> trong app để rà soát chi tiết và xử lý.
    </p>
    <p style="font-size:11px;color:#aaa;margin-top:24px">Bạn có thể tắt báo cáo này tại Cài đặt → Thông báo.</p>
  </div>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const denied = requireCronAuth(req, corsHeaders)
  if (denied) return denied

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
    const url = new URL(req.url)
    const dryRun = url.searchParams.get('dryRun') === '1'
    const tenantFilter = url.searchParams.get('tenant_id')

    // Fetch tenants active
    let tQ = supabase
      .from('tenants')
      .select('id, name, subscription_status')
    if (tenantFilter) tQ = tQ.eq('id', tenantFilter)
    const { data: tenants, error: tErr } = await tQ
    if (tErr) throw tErr

    let totalSent = 0
    const results: any[] = []

    for (const tenant of tenants ?? []) {
      if (!['active', 'trial'].includes(tenant.subscription_status ?? 'active')) continue

      // Get dead-stock report (90 days)
      const { data: deadRows, error: dErr } = await supabase.rpc('get_dead_stock_report', {
        _tenant_id: tenant.id,
        _hotel_id: null,
        _days_threshold: 90,
      })
      if (dErr) {
        results.push({ tenant_id: tenant.id, error: dErr.message })
        continue
      }
      if (!deadRows || deadRows.length === 0) {
        results.push({ tenant_id: tenant.id, skipped: 'no_dead_stock' })
        continue
      }

      const totalValue = deadRows.reduce(
        (s: number, r: any) => s + Number(r.total_value || 0),
        0,
      )

      // Find recipients: users in tenant with role owner/hotel_manager + opt-in
      const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('user_id, email_dead_stock_digest')
        .eq('tenant_id', tenant.id)
        .eq('email_dead_stock_digest', true)

      const userIds = (prefs ?? []).map((p) => p.user_id)
      if (!userIds.length) {
        results.push({ tenant_id: tenant.id, skipped: 'no_recipients' })
        continue
      }

      const { data: users } = await supabase
        .from('users')
        .select('id, email, full_name')
        .in('id', userIds)

      const html = buildHtml(tenant.name ?? 'Khách sạn', deadRows, totalValue)
      const subject = `Tồn ứ đọng tuần — ${deadRows.length} mặt hàng / ${fmtVnd(totalValue)}`

      for (const u of users ?? []) {
        if (!u.email) continue
        if (dryRun) {
          results.push({ tenant_id: tenant.id, to: u.email, dryRun: true })
          continue
        }
        try {
          await sendResend(u.email, subject, html)
          totalSent++
          results.push({ tenant_id: tenant.id, to: u.email, status: 'sent' })
        } catch (e) {
          results.push({ tenant_id: tenant.id, to: u.email, error: String(e) })
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, total_sent: totalSent, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
