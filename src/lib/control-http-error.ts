/** Structured public control errors; never retain arbitrary response bodies. */
export class ControlHttpError extends Error {
  readonly code: string | null
  readonly requestId: string | null
  constructor(readonly status: number, value: unknown) {
    const body = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const requestId = typeof body.requestId === 'string' && /^[a-z0-9-]{1,128}$/i.test(body.requestId) ? body.requestId : null
    super(`${typeof body.message === 'string' && body.message.length <= 2000 ? body.message : 'Không thể kết nối dịch vụ doanh nghiệp.'}${requestId ? ` (Mã hỗ trợ: ${requestId})` : ''}`)
    this.name = 'ControlHttpError'
    this.code = typeof body.error === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(body.error) ? body.error : null
    this.requestId = requestId
  }
}
