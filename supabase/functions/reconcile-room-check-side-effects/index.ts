import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { requireCronAuth } from '../_shared/cronAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Cron — chạy mỗi 6h.
 * So khớp room_check_issues vs room_check_issue_outbox:
 *  - Đếm dead-letter trong cửa sổ N giờ
 *  - Đếm job stuck (pending/retry quá 6h)
 *  - Đếm issue mồ côi (không có outbox)
 * Trả về JSON cho operator giám sát.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const denied = requireCronAuth(req, corsHeaders)
  if (denied) return denied

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const url = new URL(req.url)
    const hours = Number(url.searchParams.get('hours') ?? '24')

    const { data, error } = await supabase.rpc('reconcile_room_check_outbox', {
      _hours: hours,
    })
    if (error) throw error

    console.log('[reconcile-room-check-side-effects]', JSON.stringify(data))

    return new Response(JSON.stringify({ ok: true, result: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (e: any) {
    console.error('[reconcile] error', e?.message || e)
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || 'unknown_error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})
