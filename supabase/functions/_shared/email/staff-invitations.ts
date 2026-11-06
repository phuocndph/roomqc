import { buildCorsHeaders } from '../cors.ts'
import { adminClient, authenticatedUser, HttpError, json } from './admin.ts'
import { readEmailConfig, emailActionUrl } from './config.ts'
import { manageStaffInvitation, StaffInvitationDeliveryNotStarted } from './staff-invitation-management.ts'
import { getBearerToken } from '../internalAuth.ts'
import { invitationTarget, readStaffInvitationBody, verifiedStaffInvitationContext } from './staff-invitation-context.ts'

/** Shared handler keeps the existing create-user caller compatible without a password path. */
export async function handleStaffInvitations(req: Request, defaultAction?: 'create') {
  const headers = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, headers, 405)
  try {
    const client = adminClient(), user = await authenticatedUser(req, client)
    const body = await readStaffInvitationBody(req), action = defaultAction || body.action
    if (action === 'mine' || action === 'accept' || action === 'status') {
      const context = verifiedStaffInvitationContext(getBearerToken(req), user)
      const { data, error } = await client.rpc('staff_invitation_action', {
        p_actor: context.actorId, p_session: context.sessionId, p_action: action,
        p_invitation: invitationTarget(body.invitationId), p_tenant: invitationTarget(body.tenantId),
      })
      if (error) throw new HttpError(error.code === '42501' ? 403 : error.code === 'P0001' ? 409 : 503,
        error.code === '42501' ? 'Phiên hoặc quyền nhận lời mời không còn hiệu lực. Vui lòng đăng nhập lại.'
          : 'Chưa xác nhận được lời mời. Lời mời có thể đã hết hạn, bị thu hồi hoặc quyền đã thay đổi. Vui lòng liên hệ quản lý.')
      if (!data || data.version !== 1 || data.actor_id !== context.actorId || data.session_id !== context.sessionId) {
        throw new HttpError(503, 'Chưa đối chiếu được kết quả lời mời. Vui lòng kiểm tra lại.')
      }
      return json(data, headers)
    }
    const context = verifiedStaffInvitationContext(getBearerToken(req), user)
    const result = await manageStaffInvitation(action, body, context, {
      rpc: (operation, payload) => client.rpc('staff_invitation_manage', {
        p_actor: context.actorId, p_session: context.sessionId, p_action: operation, p_payload: payload,
      }),
      send: async invitation => {
        let config: ReturnType<typeof readEmailConfig>
        try { config = readEmailConfig(key => Deno.env.get(key)) }
        catch { throw new StaffInvitationDeliveryNotStarted('Invalid delivery configuration') }
        if (config.provider === 'disabled') throw new StaffInvitationDeliveryNotStarted('Invitation delivery disabled')
        const path = typeof body.path === 'string' && /^\/(?:app\/[a-z0-9][a-z0-9-]{1,62}\/)?auth\/accept-invite$/.test(body.path)
          ? body.path : '/auth/accept-invite'
        const redirectTo = emailActionUrl(config, path)
        const existing = invitation.auth_user_id ? await client.auth.admin.getUserById(invitation.auth_user_id) : null
        if (existing?.error) throw new Error('Recipient lookup unavailable')
        const confirmed = existing?.data.user?.email_confirmed_at && existing.data.user.email?.toLowerCase() === invitation.email
        if (confirmed) {
          const sent = await client.auth.resetPasswordForEmail(invitation.email, { redirectTo })
          if (sent.error || !invitation.auth_user_id) throw new Error('Invitation delivery unavailable')
          return invitation.auth_user_id
        }
        const sent = await client.auth.admin.inviteUserByEmail(invitation.email, { redirectTo, data: { full_name: invitation.full_name } })
        if (sent.error || !sent.data.user?.id) throw new Error('Invitation delivery unavailable')
        return sent.data.user.id
      },
    })
    return json(result, headers)
  } catch (error) {
    return json({ success: false, error: error instanceof HttpError ? error.message : 'Không thể xử lý lời mời.' }, headers,
      error instanceof HttpError ? error.status : 503)
  }
}
