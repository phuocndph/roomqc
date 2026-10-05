/**
 * Test thuần logic quyết định route của RoomCheckRouter.
 *
 * Vì component thực gọi nhiều hook (useRoom, useRoomCheckLeanConfig, react-router),
 * ta tách hàm quyết định ra dạng pure-ish và test bảng quyết định.
 *
 * Bảng quyết định kỳ vọng:
 *   1) type=replenish + useLean + !optOut → /rooms/:id/check-replenish
 *   2) type=delivery  + useLean + !optOut → /rooms/:id/check-delivery
 *   3) type=delivery|replenish (opt-out hoặc !useLean) → legacy wizard
 *   4) ?inspection / ?distribution_order_id / ?room_order_id → legacy wizard
 *   5) useLean=false → legacy wizard
 *   6) còn lại → /rooms/:id/check-lean
 */
import { describe, it, expect } from 'vitest'

export type RouterDecision =
  | { kind: 'redirect'; to: string }
  | { kind: 'legacy' }

export function decideRoomCheckRoute(opts: {
  id: string
  params: URLSearchParams
  useLean: boolean
}): RouterDecision {
  const { id, params, useLean } = opts
  const checkType = params.get('type') || ''
  const hasInspection = !!params.get('inspection')
  const optOutLean = params.get('lean') === '0'
  const hasDistributionOrder = !!params.get('distribution_order_id')
  const hasRoomOrder = !!params.get('room_order_id')

  if (checkType === 'replenish' && useLean && !optOutLean) {
    const qs = new URLSearchParams(params)
    qs.delete('type')
    qs.delete('lean')
    const tail = qs.toString()
    return { kind: 'redirect', to: `/rooms/${id}/check-replenish${tail ? `?${tail}` : ''}` }
  }
  if (checkType === 'delivery' && useLean && !optOutLean) {
    const qs = new URLSearchParams(params)
    qs.delete('type')
    qs.delete('lean')
    const tail = qs.toString()
    return { kind: 'redirect', to: `/rooms/${id}/check-delivery${tail ? `?${tail}` : ''}` }
  }
  if (
    checkType === 'delivery' ||
    checkType === 'replenish' ||
    hasInspection ||
    hasDistributionOrder ||
    hasRoomOrder
  ) {
    return { kind: 'legacy' }
  }
  if (!useLean) return { kind: 'legacy' }
  const qs = params.toString()
  return { kind: 'redirect', to: `/rooms/${id}/check-lean${qs ? `?${qs}` : ''}` }
}

describe('decideRoomCheckRoute', () => {
  const id = 'room-1'
  const ps = (q: string) => new URLSearchParams(q)

  it('1) type=replenish + useLean → /check-replenish, strip type & lean', () => {
    const r = decideRoomCheckRoute({ id, params: ps('type=replenish&distribution_request_id=req-9'), useLean: true })
    expect(r).toEqual({ kind: 'redirect', to: '/rooms/room-1/check-replenish?distribution_request_id=req-9' })
  })

  it('2) type=delivery + useLean → /check-delivery', () => {
    const r = decideRoomCheckRoute({ id, params: ps('type=delivery'), useLean: true })
    expect(r).toEqual({ kind: 'redirect', to: '/rooms/room-1/check-delivery' })
  })

  it('3a) type=replenish + lean=0 (opt-out) → legacy', () => {
    const r = decideRoomCheckRoute({ id, params: ps('type=replenish&lean=0'), useLean: true })
    expect(r).toEqual({ kind: 'legacy' })
  })

  it('3b) type=delivery + useLean=false → legacy', () => {
    const r = decideRoomCheckRoute({ id, params: ps('type=delivery'), useLean: false })
    expect(r).toEqual({ kind: 'legacy' })
  })

  it('4a) ?inspection=1 → legacy', () => {
    const r = decideRoomCheckRoute({ id, params: ps('inspection=1'), useLean: true })
    expect(r).toEqual({ kind: 'legacy' })
  })

  it('4b) ?distribution_order_id → legacy', () => {
    const r = decideRoomCheckRoute({ id, params: ps('distribution_order_id=do-1'), useLean: true })
    expect(r).toEqual({ kind: 'legacy' })
  })

  it('4c) ?room_order_id → legacy', () => {
    const r = decideRoomCheckRoute({ id, params: ps('room_order_id=ro-1'), useLean: true })
    expect(r).toEqual({ kind: 'legacy' })
  })

  it('5) useLean=false (no special params) → legacy', () => {
    const r = decideRoomCheckRoute({ id, params: ps(''), useLean: false })
    expect(r).toEqual({ kind: 'legacy' })
  })

  it('6) plain check → /check-lean, giữ nguyên query', () => {
    const r = decideRoomCheckRoute({ id, params: ps('from=tasks'), useLean: true })
    expect(r).toEqual({ kind: 'redirect', to: '/rooms/room-1/check-lean?from=tasks' })
  })

  it('6b) plain check không query → /check-lean không có ?', () => {
    const r = decideRoomCheckRoute({ id, params: ps(''), useLean: true })
    expect(r).toEqual({ kind: 'redirect', to: '/rooms/room-1/check-lean' })
  })
})
