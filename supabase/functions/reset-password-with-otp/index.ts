import { buildCorsHeaders } from '../_shared/cors.ts'
import { json } from '../_shared/email/admin.ts'
// Custom password-reset tokens are retired; Auth now owns issuance and verification.
Deno.serve(req => req.method === 'OPTIONS' ? new Response(null, { headers: buildCorsHeaders(req) })
  : json({ error: 'Hãy tải lại ứng dụng và sử dụng luồng khôi phục tài khoản mới.', code: 'AUTH_FLOW_UPDATED' }, buildCorsHeaders(req), 410))
