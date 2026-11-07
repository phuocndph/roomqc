export class AdviceError extends Error {
  constructor(public status: number, public code: string) { super(code); this.name = 'AdviceError' }
}
export type AdviceItem = { title: string; description: string; action: string; priority: 'high' | 'medium' | 'low'; impactVnd?: number }
export type AdviceRequest = { action: 'generate' | 'lookup' | 'cancel' | 'close'; command_id: string;
  start?: string; end?: string; hotel?: string | null; timezone?: string }
export const adviceUuid = (x: unknown): x is string => typeof x === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x)
export function object(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new AdviceError(400, 'ADVICE_INVALID_REQUEST')
  return x as Record<string, unknown>
}
export function parseAdviceRequest(input: unknown): AdviceRequest {
  const x = object(input)
  if (!adviceUuid(x.command_id) || !['generate', 'lookup', 'cancel', 'close'].includes(x.action as string)) throw new AdviceError(400, 'ADVICE_INVALID_REQUEST')
  const keys = x.action === 'lookup' ? ['action', 'command_id'] : ['action', 'command_id', 'start', 'end', 'hotel', 'timezone']
  if (Object.keys(x).length !== keys.length || Object.keys(x).some(k => !keys.includes(k))) throw new AdviceError(400, 'ADVICE_INVALID_REQUEST')
  if (x.action === 'lookup') return { action: 'lookup', command_id: x.command_id.toLowerCase() }
  for (const key of ['start', 'end']) {
    const value = x[key]
    if (typeof value !== 'string' || !/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new AdviceError(400, 'ADVICE_INVALID_REQUEST')
  }
  if ((x.start as string) < '1901-01-01' || (x.end as string) > '2100-12-31' || (x.end as string) < (x.start as string)
    || (Date.parse(x.end as string) - Date.parse(x.start as string)) / 86400000 > 365
    || (x.hotel !== null && !adviceUuid(x.hotel)) || typeof x.timezone !== 'string'
    || x.timezone.length < 1 || x.timezone.length > 100 || !/^[A-Za-z0-9_+\-/]+$/.test(x.timezone)) throw new AdviceError(400, 'ADVICE_INVALID_REQUEST')
  return { ...x, command_id: x.command_id.toLowerCase(), hotel: typeof x.hotel === 'string' ? x.hotel.toLowerCase() : null } as AdviceRequest
}
export function parseAdvice(input: unknown): AdviceItem[] {
  if (!Array.isArray(input) || input.length < 3 || input.length > 5 || JSON.stringify(input).length > 16384) throw new AdviceError(502, 'ADVICE_INVALID_OUTPUT')
  return input.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AdviceError(502, 'ADVICE_INVALID_OUTPUT')
    const x = value as Record<string, unknown>
    if (Object.keys(x).some(k => !['title', 'description', 'action', 'priority', 'impactVnd'].includes(k))
      || !['high', 'medium', 'low'].includes(x.priority as string)) throw new AdviceError(502, 'ADVICE_INVALID_OUTPUT')
    for (const key of ['title', 'description', 'action']) {
      if (typeof x[key] !== 'string' || !(x[key] as string).trim() || (x[key] as string).length > (key === 'title' ? 120 : 1000)) throw new AdviceError(502, 'ADVICE_INVALID_OUTPUT')
    }
    if (x.impactVnd !== undefined && (typeof x.impactVnd !== 'number' || !Number.isFinite(x.impactVnd)
      || x.impactVnd < 0 || x.impactVnd > 999999999999.99)) throw new AdviceError(502, 'ADVICE_INVALID_OUTPUT')
    return { title: x.title as string, description: x.description as string, action: x.action as string,
      priority: x.priority as AdviceItem['priority'], ...(x.impactVnd === undefined ? {} : { impactVnd: x.impactVnd as number }) }
  })
}
export type AdviceScope = { start: string; end: string; hotel: string | null; timezone: string }
export type AdviceReceipt = { version: 1; command_id: string; state: 'reserved' | 'unknown' | 'closed_unknown' | 'completed' | 'cancelled' | 'not_found';
  request: AdviceScope | null; context_hash: string | null; advice: AdviceItem[] | null; can_close?: boolean; closed_at?: string }
export function parseAdviceReceipt(value: unknown, command: string): AdviceReceipt {
  try {
    const x = object(value)
    if (x.version !== 1 || x.command_id !== command || !['reserved', 'unknown', 'closed_unknown', 'completed', 'cancelled', 'not_found'].includes(x.state as string)) throw new Error()
    if (x.state === 'not_found') return { version: 1, command_id: command, state: 'not_found', request: null, context_hash: null, advice: null }
    const r = object(x.request)
    if (Object.keys(r).length !== 4) throw new Error()
    const scope = parseAdviceRequest({ ...r, action: 'generate', command_id: command })
    if (x.context_hash !== null && (typeof x.context_hash !== 'string' || !/^[a-f0-9]{64}$/.test(x.context_hash))) throw new Error()
    if (x.state !== 'cancelled' && x.context_hash === null) throw new Error()
    if (x.state !== 'completed' && x.advice !== null) throw new Error()
    if (x.can_close !== undefined && (x.state !== 'unknown' || typeof x.can_close !== 'boolean')) throw new Error()
    if (x.state === 'closed_unknown') {
      if (typeof x.closed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(x.closed_at) || !Number.isFinite(Date.parse(x.closed_at))) throw new Error()
    } else if (x.closed_at !== undefined) throw new Error()
    return { version: 1, command_id: command, state: x.state as AdviceReceipt['state'],
      request: { start: scope.start!, end: scope.end!, hotel: scope.hotel!, timezone: scope.timezone! },
      context_hash: x.context_hash as string | null, advice: x.state === 'completed' ? parseAdvice(x.advice) : null,
      ...(x.can_close === undefined ? {} : { can_close: x.can_close as boolean }),
      ...(x.state === 'closed_unknown' ? { closed_at: x.closed_at as string } : {}) }
  } catch { throw new AdviceError(503, 'ADVICE_UNAVAILABLE') }
}
export async function readBoundedJson(input: { body: ReadableStream<Uint8Array> | null }, limit: number) {
  if (!input.body) throw new AdviceError(400, 'ADVICE_INVALID_JSON')
  const reader = input.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break
      size += value.byteLength; if (size > limit) { await reader.cancel(); throw new AdviceError(413, 'ADVICE_BODY_TOO_LARGE') }; chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch { throw new AdviceError(400, 'ADVICE_INVALID_JSON') }
}
