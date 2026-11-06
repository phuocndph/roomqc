import { buildCorsHeaders } from '../_shared/cors.ts'
import { json } from '../_shared/email/admin.ts'
// Welcome is emitted by the backend provisioning transaction, never by browser requests.
Deno.serve(req => req.method === 'OPTIONS' ? new Response(null, { headers: buildCorsHeaders(req) })
  : json({ error: 'Welcome emails are managed by provisioning events.' }, buildCorsHeaders(req), 410))
