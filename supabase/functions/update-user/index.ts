import { buildCorsHeaders } from '../_shared/cors.ts'
import { handleUpdateUser } from './handler.mjs'

// Metadata edits run as the caller. Role/status/phone administration is a
// separate operation; this adapter never reads or uses a service credential.
Deno.serve(req => handleUpdateUser(req, {
  endpoint: Deno.env.get('SUPABASE_URL'),
  publishableKey: Deno.env.get('SUPABASE_ANON_KEY'),
  corsHeaders: buildCorsHeaders(req),
}))
