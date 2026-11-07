import { AdviceError, adviceUuid, object, parseAdvice, parseAdviceRequest, parseAdviceReceipt, readBoundedJson } from './contracts.ts'
type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>
export type AdviceDependencies = {
  cors: (req: Request) => Record<string, string>;
  user: (token: string) => Promise<{ actorId: string; sessionId: string; rpc: Rpc }>;
  worker: Rpc; available: () => boolean;
  provider: (context: Record<string, unknown>, commandId: string, deadline: string) => Promise<unknown>;
}
const messages: Record<string, string> = {
  ADVICE_SESSION_REQUIRED: 'Vui lòng đăng nhập lại.', ADVICE_NOT_ALLOWED: 'Tài khoản hoặc gói hiện tại chưa được dùng tư vấn AI trong phạm vi này.',
  ADVICE_INVALID_REQUEST: 'Thông tin yêu cầu tư vấn không hợp lệ.', ADVICE_INVALID_JSON: 'Nội dung yêu cầu không hợp lệ.',
  ADVICE_BODY_TOO_LARGE: 'Yêu cầu vượt giới hạn.', ADVICE_CONFLICT: 'Yêu cầu cần kiểm tra lại hoặc mục tiêu cũ cần đối soát.',
  ADVICE_QUOTA_EXCEEDED: 'Đã hết hạn mức tư vấn trong ngày.', ADVICE_UNAVAILABLE: 'Dịch vụ tư vấn AI chưa sẵn sàng.',
  ADVICE_STILL_RUNNING: 'Yêu cầu vẫn trong thời hạn xử lý. Hãy kiểm tra kết quả trước khi đóng.',
}
const receipt = parseAdviceReceipt
const serverObject = (value: unknown) => { try { return object(value) } catch { throw new AdviceError(503, 'ADVICE_UNAVAILABLE') } }
export function createOperationsAdviceHandler(deps: AdviceDependencies) {
  return async (req: Request) => {
    const headers = { ...deps.cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers })
    if (req.method === 'OPTIONS') return new Response(null, { headers })
    if (req.method !== 'POST') return json(405, { code: 'ADVICE_METHOD_NOT_ALLOWED', error: 'Phương thức không hợp lệ.' })
    try {
      const authorization = req.headers.get('authorization') ?? ''
      if (authorization.length > 16384 || !/^Bearer [A-Za-z0-9_.-]+$/i.test(authorization)) throw new AdviceError(401, 'ADVICE_SESSION_REQUIRED')
      const body = parseAdviceRequest(await readBoundedJson(req, 2048)), caller = await deps.user(authorization.slice(7))
      const lookup = async () => receipt(await caller.rpc('get_operations_advice_command', { p_command_id: body.command_id }), body.command_id)
      if (body.action === 'lookup') return json(200, await lookup())
      const args = { p_command_id: body.command_id, p_start_date: body.start, p_end_date: body.end,
        p_hotel_id: body.hotel, p_timezone: body.timezone }
      if (body.action === 'cancel') return json(200, receipt(await caller.rpc('cancel_operations_advice', args), body.command_id))
      if (body.action === 'close') return json(200, receipt(await caller.rpc('close_operations_advice', args), body.command_id))
      const existing = await lookup()
      if (existing.request && (existing.request.start !== body.start || existing.request.end !== body.end
        || existing.request.hotel !== body.hotel || existing.request.timezone !== body.timezone)) throw new AdviceError(409, 'ADVICE_CONFLICT')
      if (!['not_found', 'reserved'].includes(existing.state as string)) return json(existing.state === 'unknown' ? 202 : 200, existing)
      if (!deps.available()) throw new AdviceError(503, 'ADVICE_UNAVAILABLE')
      const prepared = receipt(await caller.rpc('prepare_operations_advice', args), body.command_id)
      if (prepared.state !== 'reserved') return json(prepared.state === 'unknown' ? 202 : 200, prepared)
      const dispatch = serverObject(await deps.worker('dispatch_operations_advice', {
        p_actor_id: caller.actorId, p_command_id: body.command_id, p_session_id: caller.sessionId,
      }))
      if (dispatch.state !== 'dispatch') return json(dispatch.state === 'unknown' ? 202 : 200, await lookup())
      if (dispatch.version !== 1 || dispatch.command_id !== body.command_id || !adviceUuid(dispatch.dispatch_token)
        || typeof dispatch.context_hash !== 'string' || !/^[a-f0-9]{64}$/.test(dispatch.context_hash)
        || typeof dispatch.deadline !== 'string' || !Number.isFinite(Date.parse(dispatch.deadline))) throw new AdviceError(503, 'ADVICE_UNAVAILABLE')
      const finish = (advice: unknown) => deps.worker('finish_operations_advice', {
        p_actor_id: caller.actorId, p_command_id: body.command_id, p_dispatch_token: dispatch.dispatch_token, p_advice: advice,
      })
      try {
        // This additional live user read catches revocation/expiry between the
        // durable dispatch transition and starting external I/O. In-flight I/O
        // cannot be recalled; finish and release each have their own live fence.
        await lookup()
        const advice = parseAdvice(await deps.provider(serverObject(dispatch.context), body.command_id, dispatch.deadline))
        await finish(advice)
      } catch { try { await finish(null) } catch { /* Durable dispatch still blocks resend. */ } }
      const result = await lookup()
      return json(result.state === 'unknown' ? 202 : 200, result)
    } catch (error) {
      const e = error instanceof AdviceError ? error : new AdviceError(503, 'ADVICE_UNAVAILABLE')
      return json(e.status, { code: e.code, error: messages[e.code] ?? 'Chưa xác nhận được kết quả tư vấn. Hãy kiểm tra yêu cầu trước khi thử lại.' })
    }
  }
}
