import { createClient } from 'jsr:@supabase/supabase-js@2'
import { requireCronAuth } from '../_shared/cronAuth.ts'
import { storageTargetsForPhotos } from './paths.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

/**
 * W1-D6 cron (daily): remove room check photos 3 days after the related guest
 * stay ended without feedback. Candidates come from the database rule
 * (list_room_check_photo_retention_candidates). Files are removed through the
 * Storage API first, then references are cleared, so a failed run is retried
 * safely on the next run.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const denied = requireCronAuth(req, corsHeaders)
  if (denied) return denied

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  try {
    const { data, error } = await admin.rpc('list_room_check_photo_retention_candidates', { p_limit: 200 })
    if (error) throw error
    const rows = (data ?? []) as Array<{ room_check_id: string; photos: string[] }>

    const purged: string[] = []
    const failed: string[] = []
    for (const row of rows) {
      const targets = storageTargetsForPhotos(row.photos)
      let ok = true
      for (const [bucket, paths] of Object.entries(targets)) {
        if (paths.length === 0) continue
        const { error: removeError } = await admin.storage.from(bucket).remove(paths)
        if (removeError) { ok = false; console.error('remove_failed', row.room_check_id, bucket, removeError.message) }
      }
      ;(ok ? purged : failed).push(row.room_check_id)
    }

    let marked = 0
    if (purged.length > 0) {
      const { data: count, error: markError } = await admin.rpc('mark_room_check_photos_purged', { p_room_check_ids: purged })
      if (markError) throw markError
      marked = Number(count ?? 0)
    }
    return json({ ok: true, candidates: rows.length, marked, failed: failed.length, ranAt: new Date().toISOString() })
  } catch (e) {
    console.error('retention_failed', e)
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
