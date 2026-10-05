/**
 * Tính độ ưu tiên xử lý cho một phòng dựa trên trạng thái + tồn đọng.
 * Dùng cho RoomGrid (Owner/Manager) để sắp phòng cần xử lý lên đầu.
 *
 * Tier:
 *  - urgent (score >= 60): đỏ, "Cần xử lý ngay"
 *  - warning (score >= 30): vàng, "Theo dõi"
 *  - normal: muted
 */
import type { RoomWithStats } from '@/types/rooms.types'

export type PriorityTier = 'urgent' | 'warning' | 'normal'

export interface PriorityResult {
  score: number
  tier: PriorityTier
  /** Lý do chính khiến phòng được ưu tiên (1 dòng, tiếng Việt) */
  reason: string | null
  /** Số ngày kể từ lần kiểm gần nhất, null nếu chưa từng kiểm */
  daysSinceCheck: number | null
}

const DIRTY_STATUSES = new Set(['vacant_dirty', 'cleaning', 'check_out'])
const OOO_STATUSES = new Set(['out_of_order', 'out_of_service', 'maintenance'])
const OCCUPIED_STATUSES = new Set(['occupied', 'occupied_clean', 'occupied_dirty', 'dnd', 'sleep_out', 'service_refused'])

export function isOccupiedStatus(status: string): boolean {
  return OCCUPIED_STATUSES.has(status)
}


export interface PriorityInputs {
  pendingDistributions?: number
  /** Số phút đến giờ trả phòng (âm = đã quá giờ). null nếu phòng không có khách. */
  minutesToCheckout?: number | null
}

export function calcRoomPriority(
  room: RoomWithStats,
  pendingOrInputs: number | PriorityInputs = 0,
): PriorityResult {
  const inputs: PriorityInputs =
    typeof pendingOrInputs === 'number'
      ? { pendingDistributions: pendingOrInputs }
      : pendingOrInputs
  const pendingDistributions = inputs.pendingDistributions ?? 0
  const minutesToCheckout = inputs.minutesToCheckout ?? null

  let score = 0
  const reasons: { text: string; weight: number }[] = []

  // 1) Last check age
  let daysSinceCheck: number | null = null
  if (room.last_check_at) {
    daysSinceCheck = Math.floor((Date.now() - new Date(room.last_check_at).getTime()) / 86400000)
    if (daysSinceCheck > 30) {
      score += 50
      reasons.push({ text: `Quá hạn kiểm ${daysSinceCheck} ngày`, weight: 50 })
    } else if (daysSinceCheck > 7) {
      score += 25
      reasons.push({ text: `Chưa kiểm ${daysSinceCheck} ngày`, weight: 25 })
    }
  } else {
    score += 30
    reasons.push({ text: 'Chưa từng kiểm', weight: 30 })
  }

  // 2) Thiếu đồ — chỉ tính khi phòng đã dọn xong (vacant_clean/inspected) hoặc đang dirty
  // Phòng occupied: missing không actionable ngay → không tính điểm.
  const isOccupied = OCCUPIED_STATUSES.has(room.status)
  if (!isOccupied && room.missing_items > 0) {
    if (DIRTY_STATUSES.has(room.status)) {
      score += 40
      reasons.push({ text: `Thiếu ${room.missing_items} món sau dọn`, weight: 40 })
    } else {
      // vacant_clean/inspected nhưng còn thiếu → chờ bổ sung trước khi đón khách
      score += 25
      reasons.push({ text: `Chờ bổ sung ${room.missing_items} món`, weight: 25 })
    }
  }

  // 3) Phiếu giao đồ chờ
  if (pendingDistributions > 0) {
    score += 30
    reasons.push({ text: `${pendingDistributions} phiếu giao chờ`, weight: 30 })
  }

  // 4) Trạng thái cần hành động
  if (OOO_STATUSES.has(room.status)) {
    score += 35
    reasons.push({ text: 'Đang bảo trì / ngừng phục vụ', weight: 35 })
  } else if (DIRTY_STATUSES.has(room.status)) {
    score += 15
    reasons.push({ text: 'Cần dọn', weight: 15 })
  }

  // 5) Sắp trả phòng / quá giờ trả (chỉ áp dụng cho phòng có khách)
  if (isOccupied && minutesToCheckout !== null) {
    if (minutesToCheckout < 0) {
      const over = Math.abs(minutesToCheckout)
      score += 60
      reasons.push({ text: `Quá giờ trả ${over} phút`, weight: 60 })
    } else if (minutesToCheckout <= 30) {
      score += 45
      reasons.push({ text: `Sắp trả phòng (${minutesToCheckout} phút)`, weight: 45 })
    } else if (minutesToCheckout <= 120) {
      score += 25
      reasons.push({ text: 'Sắp trả phòng', weight: 25 })
    }
  }

  // Tier
  let tier: PriorityTier = 'normal'
  if (score >= 60) tier = 'urgent'
  else if (score >= 30) tier = 'warning'

  // Lý do hiển thị: chọn weight cao nhất
  reasons.sort((a, b) => b.weight - a.weight)
  const reason = reasons[0]?.text ?? null

  return { score, tier, reason, daysSinceCheck }
}


/**
 * Quyết định cách hiển thị thông tin "thiếu items" theo trạng thái phòng,
 * fix mâu thuẫn "đã dọn nhưng thiếu items".
 */
export type MissingDisplay =
  | { kind: 'complete' } // đầy đủ
  | { kind: 'hidden' } // không hiển thị (khách đang ở)
  | { kind: 'restock'; count: number } // đã dọn, chờ bổ sung — amber
  | { kind: 'after_clean'; count: number } // đang/vừa dọn, thiếu — red

export function getMissingDisplay(room: RoomWithStats): MissingDisplay {
  if (OCCUPIED_STATUSES.has(room.status)) return { kind: 'hidden' }
  if (room.missing_items <= 0) return { kind: 'complete' }
  if (DIRTY_STATUSES.has(room.status)) {
    return { kind: 'after_clean', count: room.missing_items }
  }
  // vacant_clean / vacant_inspected / dnd / khác
  return { kind: 'restock', count: room.missing_items }
}
