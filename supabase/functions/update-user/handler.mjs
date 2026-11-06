const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = value => typeof value === 'string' && uuid.test(value);
const keys = ['protocolVersion','userId','fullName','hotelId','positionId','reportsTo','expectedUpdatedAt','requestId'];
const authorityFields = ['userLevelCode','role','status','phone','departments'];
const messages = {
  CLIENT_UPDATE_REQUIRED: 'Hãy cập nhật ứng dụng và mở lại hồ sơ trước khi sửa nhân viên.',
  INVALID_REQUEST: 'Thông tin nhân viên không hợp lệ. Hãy kiểm tra và mở lại hồ sơ.',
  AUTH_REQUIRED: 'Vui lòng đăng nhập lại.',
  NOT_ALLOWED: 'Bạn không có quyền cập nhật nhân viên trong phạm vi này.',
  STALE_VERSION: 'Hồ sơ đã thay đổi. Hãy mở lại hồ sơ trước khi sửa.',
  REQUEST_CONFLICT: 'Mã yêu cầu đã được dùng cho nội dung khác. Hãy kiểm tra kết quả lần lưu trước.',
  OUTCOME_UNKNOWN: 'Chưa xác nhận được kết quả. Hãy thử lại với cùng mã yêu cầu và nội dung.',
  CONFIGURATION_UNAVAILABLE: 'Chức năng cập nhật tạm thời chưa sẵn sàng.',
  METHOD_NOT_ALLOWED: 'Phương thức không được hỗ trợ.',
  PAYLOAD_TOO_LARGE: 'Yêu cầu vượt quá kích thước cho phép.',
  RATE_LIMITED: 'Có quá nhiều yêu cầu. Vui lòng thử lại sau.',
};
const validTimestamp = value => typeof value === 'string' && value.length <= 64
  && /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

async function boundedJson(stream, limit, signal) {
  if (!stream) throw new Error('INVALID_REQUEST');
  const reader = stream.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new Error('OUTCOME_UNKNOWN');
      const {value, done} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => {}); throw new Error('PAYLOAD_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}

export async function handleUpdateUser(req, {endpoint, publishableKey, corsHeaders = {}, fetch: transport = fetch, deadlineMs = 15000} = {}) {
  const headers = {...corsHeaders, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'};
  const error = (code, status, extra = {}) => new Response(JSON.stringify({success: false, code, error: messages[code]}),
    {status, headers: {...headers, ...extra}});
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (req.method !== 'POST') return error('METHOD_NOT_ALLOWED', 405, {Allow: 'POST, OPTIONS'});
  const bearer = req.headers.get('authorization');
  if (!bearer || !/^Bearer [^\s,]{1,8192}$/.test(bearer)) return error('AUTH_REQUIRED', 401);
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') ?? '')) return error('INVALID_REQUEST', 415);
  const controller = new AbortController(), signal = controller.signal;
  const abort = () => controller.abort(); req.signal.addEventListener('abort', abort, {once: true});
  if (req.signal.aborted) abort();
  const timer = setTimeout(abort, Number.isInteger(deadlineMs) && deadlineMs > 0 && deadlineMs <= 15000 ? deadlineMs : 15000);
  const process = async () => {
    let body;
    try { body = await boundedJson(req.body, 16384, signal); }
    catch (cause) { if (signal.aborted) throw cause; return error(cause?.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST', cause?.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400); }
    if (!object(body)) return error('INVALID_REQUEST', 400);
    // Never infer a version, generate a new key, ignore requested authority
    // changes, or partly execute an old multi-field administrative request.
    if (body.protocolVersion !== 1 || authorityFields.some(key => Object.hasOwn(body, key))) return error('CLIENT_UPDATE_REQUIRED', 409);
    if (Object.keys(body).length !== keys.length || keys.some(key => !Object.hasOwn(body, key))
      || !isUuid(body.userId) || !isUuid(body.hotelId) || !isUuid(body.positionId) || !isUuid(body.requestId)
      || !(body.reportsTo === null || isUuid(body.reportsTo))
      || typeof body.fullName !== 'string' || body.fullName.trim().length < 2 || body.fullName.trim().length > 150
      || !(body.expectedUpdatedAt === null || validTimestamp(body.expectedUpdatedAt))) return error('INVALID_REQUEST', 400);
    let origin;
    try {
      origin = new URL(endpoint);
      if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash
        || origin.pathname !== '/' || typeof publishableKey !== 'string' || !publishableKey.trim()) throw new Error();
    } catch { return error('CONFIGURATION_UNAVAILABLE', 503); }
    const command = {p_target_id: body.userId, p_changes: {full_name: body.fullName.trim(), hotel_id: body.hotelId,
      position_id: body.positionId, reports_to: body.reportsTo}, p_expected_updated_at: body.expectedUpdatedAt, p_request_id: body.requestId};
    if (signal.aborted) throw new Error('OUTCOME_UNKNOWN');
    const reply = await transport(new URL('/rest/v1/rpc/edit_employee_profile', origin), {method: 'POST',
      headers: {apikey: publishableKey, authorization: bearer, 'content-type': 'application/json'},
      body: JSON.stringify(command), signal, redirect: 'error', credentials: 'omit', cache: 'no-store'});
    let data;
    try { data = await boundedJson(reply.body, 65536, signal); }
    catch { return error('OUTCOME_UNKNOWN', 502); }
    if (reply.status === 401) return error('AUTH_REQUIRED', 401);
    if (reply.status === 403) return error('NOT_ALLOWED', 403);
    if (reply.status === 409) return error(data?.message === 'EMPLOYEE_EDIT_STALE_VERSION' ? 'STALE_VERSION' : 'REQUEST_CONFLICT', 409);
    if (reply.status === 429) return error('RATE_LIMITED', 429);
    if (reply.status === 400 && ['22023', '22P02', '22007', '22008'].includes(data?.code)) return error('INVALID_REQUEST', 400);
    if (reply.status !== 200 || !object(data) || String(data.id).toLowerCase() !== body.userId.toLowerCase()
      || data.full_name !== command.p_changes.full_name || String(data.hotel_id).toLowerCase() !== body.hotelId.toLowerCase()
      || String(data.position_id).toLowerCase() !== body.positionId.toLowerCase()
      || (data.reports_to === null ? body.reportsTo !== null : String(data.reports_to).toLowerCase() !== body.reportsTo?.toLowerCase())
      || !['manager', 'department_manager', 'staff'].includes(data.user_level_code)
      || !(data.department === null || typeof data.department === 'string') || !validTimestamp(data.updated_at)) return error('OUTCOME_UNKNOWN', 502);
    const user = Object.fromEntries(['id','full_name','hotel_id','position_id','reports_to','department','user_level_code','updated_at'].map(key => [key, data[key]]));
    return new Response(JSON.stringify({success: true, user, message: 'Đã cập nhật hồ sơ nhân viên.'}), {status: 200, headers});
  };
  try {
    if (signal.aborted) throw new Error('OUTCOME_UNKNOWN');
    return await Promise.race([process(), new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('OUTCOME_UNKNOWN')), {once: true}))]);
  } catch { return error('OUTCOME_UNKNOWN', 503); }
  finally { clearTimeout(timer); req.signal.removeEventListener('abort', abort); controller.abort(); }
}
