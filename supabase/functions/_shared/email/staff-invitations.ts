import { buildCorsHeaders } from '../cors.ts'
import { adminClient, authenticatedUser, HttpError, json } from './admin.ts'
import { readEmailConfig, emailActionUrl } from './config.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.80.0'
import { getBearerToken } from '../internalAuth.ts'

/** Shared handler keeps the existing create-user caller compatible without a password path. */
export async function handleStaffInvitations(req: Request, defaultAction?: 'create') {
  const headers = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, headers, 405)
  try {
    const client = adminClient(), user = await authenticatedUser(req, client)
    const body = await req.json(), action = defaultAction || body.action
    if (action === 'mine') {
      const { data, error } = await client.from('staff_invitations').select('id,status,password_set_at,expires_at,full_name')
        .eq('auth_user_id', user.id).eq('email', user.email?.toLowerCase()).in('status', ['pending', 'revoked'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new HttpError(503, 'Không thể kiểm tra lời mời.')
      return json({ invitation: data ? { id: data.id, name: data.full_name, revoked: data.status === 'revoked', passwordReady: !!data.password_set_at, expired: Date.parse(data.expires_at) <= Date.now() } : null }, headers)
    }
    if (action === 'list') {
      const scoped = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${getBearerToken(req)}` } }, auth: { persistSession: false },
      })
      const { data, error } = await scoped.from('staff_invitations').select('id,email,full_name,user_level_code,hotel_id,expires_at,sent_at,created_at')
        .eq('status', 'pending').order('created_at', { ascending: false }).limit(100)
      if (error) throw new HttpError(503, 'Không thể tải danh sách lời mời.')
      return json({ invitations: data }, headers)
    }
    if (action === 'accept') {
      const { data: invitation, error: lookupError } = await client.from('staff_invitations').select('id,tenant_id,hotel_id')
        .eq('auth_user_id', user.id).eq('email', user.email?.toLowerCase()).in('status', ['pending', 'accepted']).maybeSingle()
      if (lookupError || !invitation) throw new HttpError(409, 'Không tìm thấy lời mời đang chờ. Hãy nhờ quản lý gửi lại.')
      if (body.tenantId && body.tenantId !== invitation.tenant_id) throw new HttpError(403, 'Lời mời thuộc khách sạn khác. Hãy mở đúng không gian làm việc.')
      const { data, error } = await client.rpc('accept_staff_invitation', { p_invitation: invitation.id, p_user: user.id })
      if (error) throw new HttpError(409, 'Lời mời đã hết hạn, bị thu hồi hoặc quyền người mời đã thay đổi. Vui lòng liên hệ quản lý.')
      return json(data, headers)
    }
    let invitation
    if (action === 'create') {
      const { data, error } = await client.rpc('prepare_staff_invitation', { p_creator: user.id, p_tenant: body.tenantId,
        p_hotel: body.hotelId, p_email: body.email, p_name: body.fullName, p_level: body.userLevelCode,
        p_position: body.positionId, p_reports: body.reportsTo || null })
      if (error) throw new HttpError(409, error.message)
      invitation = data
    } else if (action === 'resend' || action === 'revoke') {
      const { data, error } = await client.from('staff_invitations').select('*').eq('id', body.id).single()
      if (error || !data) throw new HttpError(404, 'Không tìm thấy lời mời.')
      const { error: permissionError } = await client.rpc('validate_staff_inviter', { p_creator: user.id, p_tenant: data.tenant_id,
        p_hotel: data.hotel_id, p_level: data.user_level_code, p_position: data.position_id, p_reports: data.reports_to })
      if (permissionError) throw new HttpError(403, 'Bạn không có quyền quản lý lời mời này.')
      invitation = data
      if (action === 'revoke') {
        const { data: revoked, error: revokeError } = await client.from('staff_invitations').update({ status: 'revoked' }).eq('id', body.id).eq('status', 'pending').select('id')
        if (revokeError || !revoked?.length) throw new HttpError(409, 'Lời mời đã được xử lý.')
        return json({ success: true }, headers)
      }
    } else throw new HttpError(400, 'Thao tác không hợp lệ.')

    if (!invitation || invitation.status !== 'pending') throw new HttpError(409, 'Lời mời không còn hiệu lực.')
    if (!invitation.auth_user_id) {
      // A newly issued invitation may follow a revoked invitation. Reuse only a
      // previously invited identity in this tenant; never delete an Auth account.
      const { data: previous } = await client.from('staff_invitations').select('auth_user_id')
        .eq('email', invitation.email).eq('tenant_id', invitation.tenant_id).eq('status', 'revoked')
        .not('auth_user_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (previous?.auth_user_id) {
        invitation.auth_user_id = previous.auth_user_id
        const { error } = await client.from('staff_invitations').update({ auth_user_id: previous.auth_user_id }).eq('id', invitation.id).eq('status', 'pending')
        if (error) throw new HttpError(503, 'Không thể chuẩn bị lời mời mới.')
      }
    }
    // Revalidate even for idempotent create/resend. Atomic send reservation prevents simultaneous sends.
    const reservedAt = new Date().toISOString()
    const { data: reserved, error: reserveError } = await client.from('staff_invitations').update({ sent_at: reservedAt })
      .eq('id', invitation.id).eq('status', 'pending').or(`sent_at.is.null,sent_at.lt.${new Date(Date.now() - 60000).toISOString()}`).select('id')
    if (reserveError || !reserved?.length) throw new HttpError(429, 'Lời mời vừa được gửi. Vui lòng chờ một phút trước khi gửi lại.')
    let redirect: string
    try {
      const config = readEmailConfig(key => Deno.env.get(key))
      // Only an internal path is accepted; role/hotel assignment stays in the invitation row.
      const path = typeof body.path === 'string' && /^\/(?:app\/[a-z0-9][a-z0-9-]{1,62}\/)?auth\/accept-invite$/.test(body.path)
        ? body.path : '/auth/accept-invite'
      redirect = emailActionUrl(config, path)
    } catch { throw new HttpError(503, 'Cấu hình địa chỉ ứng dụng chưa hợp lệ.') }
    // Auth refuses inviteUserByEmail once the recipient has verified the invite.
    // Use Auth recovery for that SAME identity, preserving its password and roles.
    const existing = invitation.auth_user_id
      ? await client.auth.admin.getUserById(invitation.auth_user_id) : null
    const confirmedIdentity = existing?.data.user?.email_confirmed_at && existing.data.user.email?.toLowerCase() === invitation.email
    let authUserId = invitation.auth_user_id, sendFailed = false
    if (confirmedIdentity) {
      const result = await client.auth.resetPasswordForEmail(invitation.email, { redirectTo: redirect })
      sendFailed = !!result.error
    } else {
      const result = await client.auth.admin.inviteUserByEmail(invitation.email, { redirectTo: redirect, data: { full_name: invitation.full_name } })
      authUserId = result.data.user?.id
      sendFailed = !!result.error
    }
    if (sendFailed || !authUserId) {
      await client.from('staff_invitations').update({ sent_at: invitation.sent_at }).eq('id', invitation.id).eq('sent_at', reservedAt)
      throw new HttpError(503, 'Chưa gửi được lời mời. Kiểm tra dịch vụ email hoặc tài khoản đã tồn tại; dữ liệu tài khoản cũ được giữ nguyên.')
    }
    const { data: saved, error: saveError } = await client.from('staff_invitations').update({ auth_user_id: authUserId,
      expires_at: new Date(Date.now() + 86400000).toISOString() }).eq('id', invitation.id).eq('status', 'pending').eq('sent_at', reservedAt)
      .select('id')
    if (saveError || !saved?.length) throw new HttpError(503, 'Lời mời đã gửi nhưng chưa ghi nhận được. Vui lòng thử lại sau một phút.')
    return json({ success: true, invitation: { id: invitation.id, email: invitation.email, full_name: invitation.full_name },
      user: { id: invitation.id, email: invitation.email, full_name: invitation.full_name }, status: 'invited', message: 'Đã gửi lời mời. Nhân viên sẽ tự đặt mật khẩu.' }, headers)
  } catch (error) {
    return json({ success: false, error: error instanceof HttpError ? error.message : 'Không thể xử lý lời mời.' }, headers,
      error instanceof HttpError ? error.status : 503)
  }
}
