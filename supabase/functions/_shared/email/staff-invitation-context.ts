import { HttpError } from './authorization.ts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Correlation only, AFTER Auth.getUser verified this exact bearer. The private
// transaction revalidates the native account and this specific live session.
export function verifiedStaffInvitationContext(token: string | null, user: { id: string; email_confirmed_at?: string | null }) {
  try {
    if (!token || token.length > 16384 || !uuid.test(user.id) || !user.email_confirmed_at) throw new Error()
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error()
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)))
    if (claims.sub !== user.id || typeof claims.session_id !== 'string' || !uuid.test(claims.session_id)) throw new Error()
    return { actorId: user.id, sessionId: claims.session_id as string }
  } catch { throw new HttpError(403, 'Phiên nhận lời mời không còn hiệu lực. Vui lòng đăng nhập lại.') }
}

export async function readStaffInvitationBody(req: Request): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader()
  if (!reader) throw new HttpError(400, 'Nội dung yêu cầu không hợp lệ.')
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16384) throw new HttpError(413, 'Yêu cầu quá lớn.')
      chunks.push(value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength }
    const data = JSON.parse(new TextDecoder().decode(bytes))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
    return data
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'Nội dung yêu cầu không hợp lệ.')
  } finally { await reader.cancel().catch(() => {}) }
}

export function invitationTarget(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !uuid.test(value)) throw new HttpError(400, 'Không gian làm việc hoặc lời mời không hợp lệ.')
  return value
}
