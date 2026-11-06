import { buildCorsHeaders } from '../_shared/cors.ts'
import { adminClient, superAdmin, HttpError, json } from '../_shared/email/admin.ts'
import { readEmailConfig, assertRecipient } from '../_shared/email/config.ts'

Deno.serve(async req => {
  const headers = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, headers, 405)
  try {
    const client = adminClient()
    const user = await superAdmin(req, client)
    const body = await req.json()
    const config = readEmailConfig(key => Deno.env.get(key))
    if (body.action === 'status') {
      const [logs, state, queued] = await Promise.all([
        client.from('email_deliveries').select('id,tenant_id,recipient_email,template_name,status,attempts,error_code,created_at,accepted_at,delivered_at,expires_at,provider_id').order('created_at', { ascending: false }).limit(100),
        client.from('email_send_state').select('retry_after_until,worker_lease_until').eq('id', 1).single(),
        client.from('email_deliveries').select('id', { count: 'exact', head: true }).in('status', ['queued', 'processing']),
      ])
      if (logs.error || state.error || queued.error) throw new HttpError(503, 'Chưa thể đọc trạng thái email.')
      return json({ provider: config.provider, environment: config.environment, sender: `${config.fromName} <${config.fromEmail}>`,
        replyTo: config.replyTo || null, enabled: config.provider !== 'disabled', domainStatus: 'not_checked',
        authDelivery: 'supabase_smtp', queue: { pending: queued.count, ...state.data }, logs: logs.data }, headers)
    }
    if (body.action === 'retry') {
      const { data, error } = await client.rpc('retry_roomqc_email', { p_id: body.id, p_actor: user.id })
      if (error || !data) throw new HttpError(409, 'Chỉ thử lại thư thất bại chưa được dịch vụ nhận, còn hạn và còn lượt gửi.')
      return json({ success: true, status: 'queued' }, headers)
    }
    if (body.action === 'test') {
      if (config.provider === 'disabled') throw new HttpError(409, 'Dịch vụ email chưa được bật trên máy chủ.')
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      try { assertRecipient(config, email) } catch { throw new HttpError(400, 'Email không hợp lệ hoặc nằm ngoài danh sách nhận thử.') }
      // One test per administrator per minute, including concurrent submits.
      const { data, error } = await client.rpc('enqueue_roomqc_email', {
        p_event_key: `test:${user.id}:${Math.floor(Date.now() / 60000)}`, p_tenant_id: null, p_recipient: email,
        p_template: 'system_test', p_data: { name: 'quản trị viên' },
      })
      if (error) throw new HttpError(503, 'Không thể đưa email vào hàng đợi.')
      return json({ success: true, id: data, status: 'queued' }, headers)
    }
    throw new HttpError(400, 'Thao tác không hợp lệ.')
  } catch (error) {
    return json({ error: error instanceof HttpError ? error.message : 'Không thể xử lý dịch vụ email.' }, headers, error instanceof HttpError ? error.status : 503)
  }
})
