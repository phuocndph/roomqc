/**
 * Shared helper to authenticate cron / internal-only edge functions.
 *
 * Accepts either:
 *   - `x-cron-secret` header matching the CRON_SECRET env var, or
 *   - `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (so pg_cron jobs
 *     already calling with the service-role key keep working).
 *
 * Returns `null` when authorized, or a `Response` to return immediately.
 */
export function requireCronAuth(req: Request, corsHeaders: Record<string, string>): Response | null {
  const cronSecret = Deno.env.get('CRON_SECRET')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  const headerSecret = req.headers.get('x-cron-secret')
  if (cronSecret && headerSecret && headerSecret === cronSecret) return null

  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (auth && serviceRole && auth === `Bearer ${serviceRole}`) return null

  return new Response(
    JSON.stringify({ error: 'Forbidden' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}
