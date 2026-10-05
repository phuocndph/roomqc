import { describe, it, expect } from 'vitest'
import { getPresenceState, isOnShift, isAvailableNow, MAX_SHIFT_HOURS, OFFLINE_THRESHOLD_MIN } from './staffPresence'

const now = () => new Date().toISOString()
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

describe('staffPresence', () => {
  it('chưa vào ca → not_on_shift', () => {
    expect(getPresenceState({ shift_start_at: null, status: 'available', last_seen_at: now() })).toBe('not_on_shift')
  })

  it('vừa vào ca, available, heartbeat tốt → on_shift_available', () => {
    expect(getPresenceState({ shift_start_at: hoursAgo(1), status: 'available', last_seen_at: minutesAgo(2) })).toBe('on_shift_available')
  })

  it('ca > 16h → shift_stale', () => {
    expect(getPresenceState({ shift_start_at: hoursAgo(MAX_SHIFT_HOURS + 1), status: 'available', last_seen_at: now() })).toBe('shift_stale')
    expect(isOnShift({ shift_start_at: hoursAgo(MAX_SHIFT_HOURS + 1), status: 'available', last_seen_at: now() })).toBe(false)
  })

  it('shift_end_at sau start → not_on_shift (đã tan ca)', () => {
    const start = hoursAgo(8)
    const end = hoursAgo(1)
    expect(getPresenceState({ shift_start_at: start, shift_end_at: end, status: 'offline' })).toBe('not_on_shift')
  })

  it('shift_end_at trước start → vẫn on-shift (do upsert)', () => {
    expect(getPresenceState({ shift_start_at: hoursAgo(1), shift_end_at: hoursAgo(3), status: 'available', last_seen_at: now() })).toBe('on_shift_available')
  })

  it('status = offline → not_on_shift kể cả khi shift còn mở', () => {
    expect(getPresenceState({ shift_start_at: hoursAgo(2), status: 'offline', last_seen_at: now() })).toBe('not_on_shift')
  })

  it('busy → on_shift_busy', () => {
    expect(getPresenceState({ shift_start_at: hoursAgo(2), status: 'busy', last_seen_at: minutesAgo(1) })).toBe('on_shift_busy')
    expect(isOnShift({ shift_start_at: hoursAgo(2), status: 'busy', last_seen_at: minutesAgo(1) })).toBe(true)
  })

  it('heartbeat quá 30 phút → on_shift_offline', () => {
    expect(getPresenceState({ shift_start_at: hoursAgo(2), status: 'available', last_seen_at: minutesAgo(OFFLINE_THRESHOLD_MIN + 5) })).toBe('on_shift_offline')
    expect(isAvailableNow({ shift_start_at: hoursAgo(2), status: 'available', last_seen_at: minutesAgo(OFFLINE_THRESHOLD_MIN + 5) })).toBe(false)
  })
})
