import { HttpError } from './authorization.ts'

type Context = { actorId: string; sessionId: string }
// Only configuration/pre-dispatch failures may release the send reservation.
// A network/SDK error may hide a committed Auth send and must remain uncertain.
export class StaffInvitationDeliveryNotStarted extends Error {}
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null }
export type ManagedStaffInvitation = {
  id: string; tenant_id: string; hotel_id: string; email: string; full_name: string
  status: string; sent_at: string | null; auth_user_id: string | null
}
type Dependencies = {
  rpc: (action: string, payload: Record<string, unknown>) => PromiseLike<RpcResult>
  send: (invitation: ManagedStaffInvitation) => Promise<string>
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))

function rpcError(error: NonNullable<RpcResult['error']>): HttpError {
  if (error.code === '42501') return new HttpError(403, 'Phiên hoặc quyền quản lý lời mời không còn hiệu lực.')
  if (error.code === 'P0001' && error.message === 'INVITATION_SEND_COOLDOWN') return new HttpError(429, 'Lời mời vừa được gửi. Vui lòng chờ một phút trước khi gửi lại.')
  if (['22023', '22P02', '22007', '22008'].includes(error.code || '')) return new HttpError(400, 'Nội dung lời mời không hợp lệ.')
  if (error.code === 'P0001' || error.code === '23505') return new HttpError(409, 'Lời mời không còn phù hợp. Vui lòng tải lại danh sách và kiểm tra quyền.')
  return new HttpError(503, 'Chưa xác nhận được kết quả lời mời. Vui lòng kiểm tra lại.')
}

export async function manageStaffInvitation(action: unknown, body: Record<string, unknown>, context: Context, deps: Dependencies) {
  if (!['list', 'create', 'resend', 'revoke'].includes(String(action))) throw new HttpError(400, 'Thao tác không hợp lệ.')
  const payload: Record<string, unknown> = {}
  if (action === 'list' && (body.pageSize !== undefined || body.cursor !== undefined)) {
    if (body.pageSize !== 50 || (body.cursor !== null && (!object(body.cursor)
      || !timestamp(body.cursor.createdAt) || typeof body.cursor.createdAt !== 'string' || body.cursor.createdAt.length > 40
      || typeof body.cursor.id !== 'string' || !uuid.test(body.cursor.id)))) {
      throw new HttpError(400, 'Trang lời mời không hợp lệ.')
    }
    payload.pageSize = 50
    payload.cursor = body.cursor
  }
  // Optional for legacy callers, mandatory in the current UI. The transaction
  // checks this expectation against its live actor/target before returning.
  if (action !== 'create' && body.tenantId !== undefined) {
    if (typeof body.tenantId !== 'string' || !uuid.test(body.tenantId)) throw new HttpError(400, 'Doanh nghiệp không hợp lệ.')
    payload.tenantId = body.tenantId
  }
  if (action !== 'create' && body.hotelId !== undefined && body.hotelId !== null) {
    if (typeof body.hotelId !== 'string' || !uuid.test(body.hotelId)) throw new HttpError(400, 'Khách sạn không hợp lệ.')
    payload.hotelId = body.hotelId
  }
  if (action === 'create') {
    for (const field of ['tenantId', 'hotelId', 'positionId']) {
      if (typeof body[field] !== 'string' || !uuid.test(body[field] as string)) throw new HttpError(400, 'Khách sạn hoặc vị trí không hợp lệ.')
      payload[field] = body[field]
    }
    if (body.reportsTo !== undefined && body.reportsTo !== null && (typeof body.reportsTo !== 'string' || !uuid.test(body.reportsTo))) throw new HttpError(400, 'Người quản lý không hợp lệ.')
    if (typeof body.email !== 'string' || body.email.trim().length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(body.email.trim())
      || typeof body.fullName !== 'string' || body.fullName.trim().length < 2 || body.fullName.trim().length > 150
      || !['manager', 'department_manager', 'staff'].includes(String(body.userLevelCode))) throw new HttpError(400, 'Email, họ tên hoặc cấp bậc không hợp lệ.')
    Object.assign(payload, { email: body.email.trim().toLowerCase(), fullName: body.fullName.trim(), userLevelCode: body.userLevelCode, reportsTo: body.reportsTo ?? null })
  } else if (action !== 'list') {
    if (typeof body.id !== 'string' || !uuid.test(body.id)) throw new HttpError(400, 'Lời mời không hợp lệ.')
    payload.id = body.id
  }
  const call = async (operation: string, fields: Record<string, unknown>) => {
    const result = await deps.rpc(operation, fields)
    if (result.error) throw rpcError(result.error)
    if (!object(result.data) || result.data.version !== 1 || result.data.actor_id !== context.actorId || result.data.session_id !== context.sessionId
      || typeof result.data.tenant_id !== 'string' || !uuid.test(result.data.tenant_id)
      || (payload.tenantId !== undefined && result.data.tenant_id !== payload.tenantId)
      || (operation !== 'list' && result.data.success !== true)) {
      throw new HttpError(503, 'Chưa đối chiếu được kết quả lời mời.')
    }
    return result.data
  }
  const readInvitation = (result: Record<string, unknown>, expectedId?: string): ManagedStaffInvitation => {
    const row = result.invitation
    if (!object(row) || typeof row.id !== 'string' || !uuid.test(row.id) || (expectedId && row.id !== expectedId)
      || typeof row.tenant_id !== 'string' || !uuid.test(row.tenant_id) || typeof row.hotel_id !== 'string' || !uuid.test(row.hotel_id)
      || typeof row.email !== 'string' || typeof row.full_name !== 'string' || typeof row.status !== 'string'
      || (row.sent_at !== null && !timestamp(row.sent_at)) || (row.auth_user_id !== null && (typeof row.auth_user_id !== 'string' || !uuid.test(row.auth_user_id)))
      || (action === 'create' && (row.tenant_id !== payload.tenantId || row.hotel_id !== payload.hotelId))) {
      throw new HttpError(503, 'Chưa đối chiếu được lời mời cần xử lý.')
    }
    return row as ManagedStaffInvitation
  }
  if (action === 'list') {
    const result = await call('list', payload)
    if (!Array.isArray(result.invitations) || result.invitations.length > 100) throw new HttpError(503, 'Không thể tải danh sách lời mời.')
    return result
  }
  const prepared = await call(action === 'resend' ? 'reserve' : String(action), payload)
  const invitation = readInvitation(prepared, typeof payload.id === 'string' ? payload.id : undefined)
  if (action === 'revoke') {
    if (prepared.success !== true || invitation.status !== 'revoked') throw new HttpError(503, 'Chưa xác nhận được kết quả thu hồi.')
    return { version: 1, actor_id: context.actorId, session_id: context.sessionId, success: true, invitation_id: invitation.id,
      tenant_id: invitation.tenant_id, hotel_id: invitation.hotel_id, status: 'revoked', idempotent: prepared.idempotent }
  }
  const reserved = action === 'create' ? await call('reserve', { id: invitation.id }) : prepared
  const sending = readInvitation(reserved, invitation.id)
  if (sending.status !== 'pending' || !timestamp(sending.sent_at) || sending.tenant_id !== invitation.tenant_id || sending.hotel_id !== invitation.hotel_id
    || (reserved.previous_sent_at !== null && !timestamp(reserved.previous_sent_at))) throw new HttpError(503, 'Chưa xác nhận được lượt gửi lời mời.')
  let authUserId: string
  try {
    authUserId = await deps.send(sending)
    if (!uuid.test(authUserId)) throw new Error('Invalid recipient identity')
  } catch (error) {
    if (error instanceof StaffInvitationDeliveryNotStarted) {
      try { await call('release', { id: sending.id, reservedAt: sending.sent_at, previousSentAt: reserved.previous_sent_at }) } catch { /* uncertain reservation: never claim delivery */ }
    }
    throw new HttpError(503, 'Chưa gửi được lời mời. Dữ liệu tài khoản cũ được giữ nguyên; vui lòng kiểm tra lại sau.')
  }
  // Failure here is an unknown post-send outcome, never a safe reason to send
  // again immediately. Leave the reservation intact; no blind release/retry.
  const finished = readInvitation(await call('finish', { id: sending.id, reservedAt: sending.sent_at, authUserId }), sending.id)
  if (finished.status !== 'pending' || finished.auth_user_id !== authUserId || finished.tenant_id !== sending.tenant_id
    || finished.hotel_id !== sending.hotel_id || finished.sent_at !== sending.sent_at) throw new HttpError(503, 'Lời mời đã gửi nhưng chưa đối chiếu được kết quả.')
  const publicInvitation = { id: finished.id, email: finished.email, full_name: finished.full_name }
  return { version: 1, actor_id: context.actorId, session_id: context.sessionId, success: true,
    invitation_id: finished.id, tenant_id: finished.tenant_id, hotel_id: finished.hotel_id, invitation: publicInvitation,
    user: publicInvitation, status: 'invited', message: 'Đã gửi lời mời. Nhân viên sẽ tự đặt mật khẩu.' }
}
