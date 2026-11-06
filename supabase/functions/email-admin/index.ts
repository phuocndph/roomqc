import { buildCorsHeaders } from '../_shared/cors.ts'
import { adminClient, superAdmin, HttpError, json } from '../_shared/email/admin.ts'
import { readEmailConfig, assertRecipient } from '../_shared/email/config.ts'
import { getBearerToken } from '../_shared/internalAuth.ts'
import { verifiedEmailAdministratorContext } from '../_shared/email/authorization.ts'

Deno.serve(async req => {
  const headers = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, headers, 405)
  try {
    const client = adminClient()
    const user = await superAdmin(req, client)
    const context = verifiedEmailAdministratorContext(getBearerToken(req), user.id)
    const body = await req.json()
    const config = readEmailConfig(key => Deno.env.get(key))
    const execute = async (action: string, fields: Record<string, unknown> = {}) => {
      const { data, error } = await client.rpc('execute_email_admin_action', {
        ...fields, p_actor: context.actorId, p_session: context.sessionId, p_action: action,
      })
      if (error?.code === '42501') throw new HttpError(403, 'Phiên quản trị email không còn hiệu lực.')
      if (error) {
        if (action === 'retry' && ['22023', '22P02'].includes(error.code)) {
          throw new HttpError(409, 'Chỉ thử lại thư thất bại chưa được dịch vụ nhận, còn hạn và còn lượt gửi.')
        }
        throw new HttpError(503, 'Không thể xử lý dịch vụ email.')
      }
      return data
    }
    if (body.action === 'status') {
      const state = await execute('status')
      if (!state?.queue || !Array.isArray(state.logs)) throw new HttpError(503, 'Chưa thể đọc trạng thái email.')
      return json({ provider: config.provider, environment: config.environment, sender: `${config.fromName} <${config.fromEmail}>`,
        replyTo: config.replyTo || null, enabled: config.provider !== 'disabled', domainStatus: 'not_checked',
        authDelivery: 'supabase_smtp', queue: state.queue, logs: state.logs }, headers)
    }
    if (body.action === 'retry') {
      const data = await execute('retry', { p_delivery_id: body.id ?? null })
      if (!data?.success) throw new HttpError(409, 'Chỉ thử lại thư thất bại chưa được dịch vụ nhận, còn hạn và còn lượt gửi.')
      return json({ success: true, status: 'queued' }, headers)
    }
    if (body.action === 'test') {
      if (config.provider === 'disabled') throw new HttpError(409, 'Dịch vụ email chưa được bật trên máy chủ.')
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      try { assertRecipient(config, email) } catch { throw new HttpError(400, 'Email không hợp lệ hoặc nằm ngoài danh sách nhận thử.') }
      const data = await execute('test', { p_recipient: email })
      if (!data?.success || !data.id) throw new HttpError(503, 'Không thể đưa email vào hàng đợi.')
      return json({ success: true, id: data.id, status: 'queued' }, headers)
    }
    throw new HttpError(400, 'Thao tác không hợp lệ.')
  } catch (error) {
    return json({ error: error instanceof HttpError ? error.message : 'Không thể xử lý dịch vụ email.' }, headers, error instanceof HttpError ? error.status : 503)
  }
})
