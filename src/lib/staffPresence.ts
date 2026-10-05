/**
 * Single source of truth for "đang trong ca" / staff presence logic.
 * Dùng chung cho mọi dropdown giao việc và trang Quản lý nhân sự.
 *
 * Định nghĩa "đang trong ca" (isOnShift):
 *  1) shift_start_at IS NOT NULL
 *  2) shift_end_at IS NULL hoặc shift_end_at < shift_start_at
 *  3) shift_start_at trong vòng MAX_SHIFT_HOURS (mặc định 16h) — quá là ca treo
 *  4) status !== 'offline'
 *
 * Tách thêm trạng thái "ngoại tuyến" khi last_seen_at quá OFFLINE_THRESHOLD_MIN
 * (mặc định 30 phút) — vẫn được coi là on-shift nhưng disable/cảnh báo ở UI.
 */

export const MAX_SHIFT_HOURS = 16
export const OFFLINE_THRESHOLD_MIN = 30

export type StaffPresenceState =
  | 'on_shift_available'   // Đang trong ca + status available + heartbeat tốt
  | 'on_shift_busy'        // Đang trong ca + busy/break + heartbeat tốt
  | 'on_shift_offline'     // Đang trong ca nhưng heartbeat quá hạn
  | 'shift_stale'          // Ca treo > MAX_SHIFT_HOURS — coi như không trong ca
  | 'not_on_shift'         // Chưa bấm vào ca / đã tan ca / status offline

export interface StaffPresenceInput {
  shift_start_at?: string | null
  shift_end_at?: string | null
  status?: string | null
  last_seen_at?: string | null
}

function toMs(d: string | null | undefined): number | null {
  if (!d) return null
  const t = new Date(d).getTime()
  return Number.isFinite(t) ? t : null
}

export function getPresenceState(input: StaffPresenceInput | null | undefined): StaffPresenceState {
  if (!input) return 'not_on_shift'

  const startMs = toMs(input.shift_start_at)
  const endMs = toMs(input.shift_end_at)
  const lastSeenMs = toMs(input.last_seen_at)
  const now = Date.now()

  // 1. Phải có shift_start_at
  if (!startMs) return 'not_on_shift'

  // 2. Ca đã kết thúc (shift_end_at >= shift_start_at)
  if (endMs !== null && endMs >= startMs) return 'not_on_shift'

  // 3. Ca quá hạn
  if (now - startMs > MAX_SHIFT_HOURS * 3600_000) return 'shift_stale'

  // 4. Status offline => coi như không trong ca
  if (input.status === 'offline') return 'not_on_shift'

  // 5. Heartbeat quá hạn => on-shift nhưng ngoại tuyến
  if (lastSeenMs !== null && now - lastSeenMs > OFFLINE_THRESHOLD_MIN * 60_000) {
    return 'on_shift_offline'
  }

  // 6. Busy / break
  if (input.status === 'busy' || input.status === 'break') return 'on_shift_busy'

  // 7. Mặc định = sẵn sàng
  return 'on_shift_available'
}

/** Đang trong ca theo định nghĩa nghiệp vụ (bao gồm busy/break + offline-heartbeat) */
export function isOnShift(input: StaffPresenceInput | null | undefined): boolean {
  const s = getPresenceState(input)
  return s === 'on_shift_available' || s === 'on_shift_busy' || s === 'on_shift_offline'
}

/** Có thể giao việc ngay (sẵn sàng) */
export function isAvailableNow(input: StaffPresenceInput | null | undefined): boolean {
  return getPresenceState(input) === 'on_shift_available'
}

/** Ca treo cần đóng */
export function isShiftStale(input: StaffPresenceInput | null | undefined): boolean {
  return getPresenceState(input) === 'shift_stale'
}

// ── Hiển thị ───────────────────────────────────────────────────────────────
export const PRESENCE_LABEL: Record<StaffPresenceState, string> = {
  on_shift_available: 'Sẵn sàng',
  on_shift_busy: 'Đang bận',
  on_shift_offline: 'Mất kết nối',
  shift_stale: 'Ca treo (quá 16 giờ)',
  not_on_shift: 'Ngoài ca',
}

/** Tailwind text color theo design system (semantic) */
export const PRESENCE_TEXT_COLOR: Record<StaffPresenceState, string> = {
  on_shift_available: 'text-green-600',
  on_shift_busy: 'text-amber-600',
  on_shift_offline: 'text-muted-foreground',
  shift_stale: 'text-red-600',
  not_on_shift: 'text-muted-foreground',
}

/** Dot color cho badge tròn */
export const PRESENCE_DOT_COLOR: Record<StaffPresenceState, string> = {
  on_shift_available: 'bg-green-500',
  on_shift_busy: 'bg-amber-500',
  on_shift_offline: 'bg-muted-foreground',
  shift_stale: 'bg-red-500',
  not_on_shift: 'bg-muted-foreground',
}

/** Thứ tự sort: available → busy → offline → stale → not_on_shift */
export const PRESENCE_SORT_ORDER: Record<StaffPresenceState, number> = {
  on_shift_available: 0,
  on_shift_busy: 1,
  on_shift_offline: 2,
  shift_stale: 3,
  not_on_shift: 4,
}
