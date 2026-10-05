// Cron-triggered: gỡ DND/OOS hết hạn bằng cách gọi RPC `lift_expired_dnd_oos`.
// Schedule (đề xuất): mỗi 5 phút.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const client = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await client.rpc('lift_expired_dnd_oos')
    if (error) throw error

    console.log('[lift-expired-dnd-oos] Result:', data)
    return new Response(JSON.stringify({ ok: true, ...((data as object) ?? {}) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[lift-expired-dnd-oos] Error:', err)
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
