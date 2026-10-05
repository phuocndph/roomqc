import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { requireCronAuth } from '../_shared/cronAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const denied = requireCronAuth(req, corsHeaders)
  if (denied) return denied

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let totalProcessed = 0
    let totalDone = 0
    let totalFailed = 0
    let totalSkipped = 0

    // Process up to 5 batches × 50 = 250 jobs/run
    for (let i = 0; i < 5; i++) {
      const { data, error } = await supabase.rpc('process_room_check_issue_outbox', {
        _limit: 50,
      })
      if (error) throw error
      const r = (data as any) || {}
      totalProcessed += r.processed ?? 0
      totalDone += r.done ?? 0
      totalFailed += r.failed ?? 0
      totalSkipped += r.skipped ?? 0
      if ((r.processed ?? 0) === 0) break
    }

    const result = {
      processed: totalProcessed,
      done: totalDone,
      failed: totalFailed,
      skipped: totalSkipped,
    }

    console.log('[process-room-check-outbox]', JSON.stringify(result))

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (e: any) {
    console.error('[process-room-check-outbox] error', e?.message || e)
    return new Response(
      JSON.stringify({ error: e?.message || 'unknown_error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})
