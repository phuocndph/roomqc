import { AdviceError, object, parseAdvice, parseAdviceRequest, readBoundedJson } from './contracts.ts'

const unavailable = () => new AdviceError(503, 'ADVICE_UNAVAILABLE')
const number = (x: unknown, count = false): number => {
  if (typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > 1e15 || (count && (!Number.isSafeInteger(x) || x < 0))) throw unavailable()
  return x
}
const plain = (x: unknown) => { try { return object(x) } catch { throw unavailable() } }
/** Allowlisted aggregates only: no IDs, guest/contact data, wages or department names. */
export function projectAdviceContext(input: unknown) {
  const c = plain(input), p = plain(c.period), capacity = plain(c.capacity)
  if (c.version !== 1 || c.labor_is_estimate !== true || typeof c.targets_applicable !== 'boolean'
    || capacity.method !== 'current_registered_rooms' || capacity.is_estimate !== true || c.recognition_timezone !== p.timezone) throw unavailable()
  let period
  try { period = parseAdviceRequest({ ...p, action: 'generate', command_id: '00000000-0000-0000-0000-000000000001' }) } catch { throw unavailable() }
  const project = (value: unknown) => {
    const x = plain(value), room = plain(x.room), fees = plain(x.no_show), costs = plain(x.cost_summary)
    if (typeof x.period_start !== 'string' || typeof x.period_end !== 'string') throw unavailable()
    // A valid current period starting in1901 can have a prior/YoY period in1900.
    for (const date of [x.period_start, x.period_end]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
        || date < '1900-01-01' || date > '2100-12-31') throw unavailable()
    }
    const revenue = number(x.recognized_revenue), roomRevenue = number(room.netRevenue), retained = number(fees.retainedAmount)
    const purchase = number(costs.purchase_cost), laundry = number(costs.laundry_cost), maintenance = number(costs.maintenance_cost)
    const total = number(costs.total_cost), profit = number(x.net_profit)
    const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 1e-9
    if (!close(revenue, roomRevenue + retained) || !close(total, purchase + laundry + maintenance) || !close(profit, revenue - total)
      || fees.cashMovement !== 0) throw unavailable()
    const days = number(x.period_days, true), rooms = number(capacity.total_rooms, true), occupied = number(x.occupied_room_days, true)
    if (days < 1 || days > 366 || days !== (Date.parse(x.period_end) - Date.parse(x.period_start)) / 86400000 + 1 || occupied > rooms * days) throw unavailable()
    return { start: x.period_start, end: x.period_end, days,
      recognized_revenue: revenue, checkout_room_net_revenue: roomRevenue, retained_no_show_fee: retained,
      refund_due_not_paid: number(fees.refundDueAmount), purchase_cost: purchase, laundry_cost: laundry,
      maintenance_cost: maintenance, total_cost_before_labor: total, profit_before_labor_and_fixed: profit,
      checkout_count: number(x.earned_checkout_count, true), checkout_cohort_nights: number(x.checkout_room_nights, true),
      occupied_room_days_estimate: occupied, invalid_checkout_dates: number(x.invalid_checkout_dates_count, true) }
  }
  const targets = plain(c.targets), allowed = ['occupancy', 'revpar', 'adr', 'gop_margin', 'goppar', 'labor_ratio', 'net_revenue', 'gop']
  if (Object.keys(targets).some(k => !allowed.includes(k)) || (!c.targets_applicable && Object.keys(targets).length)) throw unavailable()
  for (const [key, raw] of Object.entries(targets)) {
    const value = number(raw)
    if (Math.abs(value) > 999999999999.99 || Number(value.toFixed(2)) !== value
      || (key === 'occupancy' && (value < 0 || value > 100)) || (key === 'gop_margin' && (value < -1000 || value > 100))
      || (key === 'labor_ratio' && (value < 0 || value > 1000)) || (!['gop', 'goppar', 'gop_margin'].includes(key) && value < 0)) throw unavailable()
  }
  const result = { version: 1, period: { start: period.start, end: period.end, timezone: period.timezone },
    current_registered_rooms_estimate: number(capacity.total_rooms, true), current: project(c.current),
    previous: project(c.previous), year_ago: project(c.year_ago), current_labor_estimate: number(c.labor_estimate),
    targets_applicable: c.targets_applicable, targets: Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, number(v)])) }
  if (result.current.start !== period.start || result.current.end !== period.end) throw unavailable()
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 16384) throw unavailable()
  return result
}

export const adviceSystemPrompt = `Bạn tư vấn vận hành khách sạn bằng tiếng Việt. Chỉ dùng số liệu tổng hợp được cung cấp.
Doanh thu ghi nhận gồm doanh thu ròng lượt đã trả phòng và phí giữ cọc no-show; khác tiền thực thu.
Khoản cần hoàn chưa phải tiền đã hoàn. ADR dùng doanh thu phòng và đêm của lượt đã trả phòng;
RevPAR chỉ dùng doanh thu phòng. Công suất dựa ngày lưu trú và số phòng hiện có là ước tính.
Lương hiện kỳ là ước tính, không phải bảng lương chốt; chưa có lương kỳ trước để so lợi nhuận sau lương.
Lợi nhuận nguồn chưa trừ lương và ngân sách cố định. Mục tiêu chỉ dùng khi targets_applicable=true.
Ngày lưu trú sai hoặc mẫu số 0 phải nêu thiếu dữ liệu, không khẳng định vận hành ổn định.
Đưa 3–5 lời khuyên ngắn, hành động cụ thể, ưu tiên high/medium/low; tác động VNĐ chỉ là ước tính có cơ sở.
Không đề xuất quyết định chắc chắn dựa trên số liệu thiếu. Trả bằng công cụ submit_advice.`
export const adviceTool = { type: 'function', function: { name: 'submit_advice', description: 'Lời khuyên vận hành có phạm vi',
  parameters: { type: 'object', additionalProperties: false, required: ['advice'], properties: { advice: { type: 'array', minItems: 3, maxItems: 5,
    items: { type: 'object', additionalProperties: false, required: ['title', 'description', 'action', 'priority'], properties: {
      title: { type: 'string', maxLength: 120 }, description: { type: 'string', maxLength: 1000 }, action: { type: 'string', maxLength: 1000 },
      priority: { type: 'string', enum: ['high', 'medium', 'low'] }, impactVnd: { type: 'number', minimum: 0, maximum: 999999999999.99 } } } } } } } }

export function createAdviceProvider(config: { provider: 'disabled' | 'lovable' | 'fixture'; key: string; fixtureOwner: string }, request: typeof fetch = fetch,
  now: () => number = Date.now) {
  return async (context: Record<string, unknown>, commandId: string, deadline: string) => {
    const projected = projectAdviceContext(context), remaining = Date.parse(deadline) - now()
    if (config.provider === 'disabled' || !Number.isFinite(remaining) || remaining < 1 || remaining > 61000) throw unavailable()
    const fixture = config.provider === 'fixture'
    if ((!fixture && !config.key) || (fixture && !/^[a-f0-9]{12}$/.test(config.fixtureOwner))) throw unavailable()
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.min(remaining, 45000))
    try {
      const response = await request(fixture ? 'http://api-gw:9083/v1/chat/completions' : 'https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(fixture ? { 'X-RoomQC-Fixture-Owner': config.fixtureOwner } : { Authorization: 'Bearer ' + config.key }),
          'X-RoomQC-Command': commandId },
        body: JSON.stringify({ model: 'google/gemini-3-flash-preview', temperature: 0.2, max_tokens: 1800,
          messages: [{ role: 'system', content: adviceSystemPrompt }, { role: 'user', content: JSON.stringify(projected) }],
          tools: [adviceTool], tool_choice: { type: 'function', function: { name: 'submit_advice' } } }),
      })
      if (!response.ok) { await response.body?.cancel(); throw unavailable() }
      const body = plain(await readBoundedJson(response, 32768))
      if (!Array.isArray(body.choices) || body.choices.length !== 1) throw unavailable()
      const message = plain(plain(body.choices[0]).message)
      if (!Array.isArray(message.tool_calls) || message.tool_calls.length !== 1) throw unavailable()
      const call = plain(plain(message.tool_calls[0]).function)
      if (call.name !== 'submit_advice' || typeof call.arguments !== 'string' || call.arguments.length > 16384) throw unavailable()
      const args = plain(JSON.parse(call.arguments))
      if (Object.keys(args).join(',') !== 'advice' || controller.signal.aborted || now() >= Date.parse(deadline)) throw unavailable()
      return parseAdvice(args.advice)
    } catch { throw unavailable() } finally { clearTimeout(timer) }
  }
}
