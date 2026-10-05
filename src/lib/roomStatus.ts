/**
 * Room Status v2 — nguồn duy nhất cho mọi label/màu/icon trạng thái phòng.
 *
 * Hỗ trợ song song state machine mới (11 trạng thái) và bí danh legacy
 * (`vacant`, `occupied`, `cleaning`, `maintenance`, `check_in`, `check_out`)
 * trong giai đoạn rollout. Code mới NÊN ưu tiên helper `normalizeRoomStatus`
 * và `ROOM_STATUS_META` thay vì hardcode chuỗi.
 */
import type { RoomStatus, RoomStatusV2, RoomStatusLegacy } from '@/types/rooms.types'

/** Nhóm logic dùng cho filter / dashboard / report */
export type RoomStatusGroup = 'available' | 'occupied' | 'unavailable' | 'special'

export interface RoomStatusMeta {
  label: string                 // Nhãn tiếng Việt
  short: string                 // Nhãn ngắn cho badge mobile
  group: RoomStatusGroup
  /** className text color (semantic) */
  text: string
  /** className background nhẹ */
  bg: string
  /** className viền */
  border: string
  /** Mô tả dùng trong tooltip / help */
  description: string
}

/**
 * Bảng metadata cho trạng thái mới (state machine v2).
 * Trạng thái legacy được map thông qua `LEGACY_TO_V2` rồi tra ở đây.
 */
export const ROOM_STATUS_META_V2: Record<RoomStatusV2, RoomStatusMeta> = {
  vacant_clean: {
    label: 'Trống – đã dọn',
    short: 'Sạch',
    group: 'available',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    description: 'Phòng sạch, sẵn sàng bán cho khách.',
  },
  vacant_inspected: {
    label: 'Trống – đã QC',
    short: 'QC ✓',
    group: 'available',
    text: 'text-emerald-800',
    bg: 'bg-emerald-100',
    border: 'border-emerald-300',
    description: 'Đã qua kiểm tra của giám sát, ưu tiên giao khách VIP.',
  },
  vacant_dirty: {
    label: 'Trống – chưa dọn',
    short: 'Bẩn',
    group: 'unavailable',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    description: 'Khách đã trả phòng, chờ buồng phòng dọn.',
  },
  occupied_clean: {
    label: 'Đang ở – đã dọn',
    short: 'Đang ở',
    group: 'occupied',
    text: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    description: 'Khách đang lưu trú, phòng đã được dọn.',
  },
  occupied_dirty: {
    label: 'Đang ở – cần dọn',
    short: 'Cần dọn',
    group: 'occupied',
    text: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    description: 'Khách đang ở, đến lượt dọn giữa kỳ lưu trú.',
  },
  dnd: {
    label: 'Không làm phiền',
    short: 'DND',
    group: 'occupied',
    text: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    description: 'Khách treo biển DND, không được vào phòng.',
  },
  service_refused: {
    label: 'Khách từ chối dọn',
    short: 'Từ chối',
    group: 'occupied',
    text: 'text-pink-700',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    description: 'HK đến nhưng khách từ chối dịch vụ. Báo lại cuối ca.',
  },
  sleep_out: {
    label: 'Khách ngủ ngoài',
    short: 'Ngủ ngoài',
    group: 'occupied',
    text: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    description: 'Còn booking, không ngủ tại phòng đêm nay.',
  },
  skipper: {
    label: 'Khách bỏ trốn',
    short: 'Bỏ trốn',
    group: 'special',
    text: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-300',
    description: 'Khách rời mà chưa thanh toán — cần FO/Quản lý xử lý.',
  },
  out_of_order: {
    label: 'Phòng hỏng (OOO)',
    short: 'Hỏng',
    group: 'unavailable',
    text: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    description: 'Hỏng nặng, chờ sửa, không bán được.',
  },
  out_of_service: {
    label: 'Tạm ngừng (OOS)',
    short: 'OOS',
    group: 'unavailable',
    text: 'text-slate-700',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    description: 'Tạm khóa do bảo trì định kỳ hoặc deep cleaning.',
  },
}

/** Map bí danh legacy → trạng thái v2 mặc định (an toàn nhất) */
export const LEGACY_TO_V2: Record<RoomStatusLegacy, RoomStatusV2> = {
  vacant: 'vacant_clean',
  occupied: 'occupied_clean',
  cleaning: 'vacant_dirty',
  maintenance: 'out_of_service',
  out_of_order: 'out_of_order',
  check_in: 'occupied_clean',
  check_out: 'vacant_dirty',
}

/** Map ngược v2 → legacy (cho query/analytics cũ) */
export const V2_TO_LEGACY: Record<RoomStatusV2, RoomStatusLegacy> = {
  vacant_clean: 'vacant',
  vacant_inspected: 'vacant',
  vacant_dirty: 'cleaning',
  occupied_clean: 'occupied',
  occupied_dirty: 'occupied',
  dnd: 'occupied',
  service_refused: 'occupied',
  sleep_out: 'occupied',
  skipper: 'occupied',
  out_of_order: 'out_of_order',
  out_of_service: 'maintenance',
}

/** Chuẩn hóa bất kỳ status nào (legacy hoặc v2) về v2 */
export function normalizeRoomStatus(status: string | null | undefined): RoomStatusV2 {
  if (!status) return 'vacant_clean'
  if (status in ROOM_STATUS_META_V2) return status as RoomStatusV2
  if (status in LEGACY_TO_V2) return LEGACY_TO_V2[status as RoomStatusLegacy]
  return 'vacant_clean'
}

/** Lấy metadata cho bất kỳ status nào (chấp nhận cả legacy) */
export function getRoomStatusMeta(status: string | null | undefined): RoomStatusMeta {
  return ROOM_STATUS_META_V2[normalizeRoomStatus(status)]
}

/** Helper nhanh cho UI cũ: chỉ cần label */
export function getRoomStatusLabel(status: string | null | undefined): string {
  return getRoomStatusMeta(status).label
}

/** Liệt kê toàn bộ trạng thái v2 (cho dropdown/filter) */
export const ROOM_STATUS_V2_LIST: RoomStatusV2[] = [
  'vacant_clean',
  'vacant_inspected',
  'vacant_dirty',
  'occupied_clean',
  'occupied_dirty',
  'dnd',
  'service_refused',
  'sleep_out',
  'skipper',
  'out_of_order',
  'out_of_service',
]

/** Có thể check-in vào phòng không? (theo nghiệp vụ thường) */
export function canRoomCheckIn(status: string | null | undefined): boolean {
  const v = normalizeRoomStatus(status)
  return v === 'vacant_clean' || v === 'vacant_inspected'
}

/** Phòng đang có khách (mọi biến thể occupied) */
export function isRoomOccupied(status: string | null | undefined): boolean {
  return getRoomStatusMeta(status).group === 'occupied'
}

/** Phòng đang bị chặn vì bảo trì/hỏng */
export function isRoomBlockedForMaintenance(status: string | null | undefined): boolean {
  const v = normalizeRoomStatus(status)
  return v === 'out_of_order' || v === 'out_of_service'
}

/** Phòng cần dọn */
export function isRoomDirty(status: string | null | undefined): boolean {
  const v = normalizeRoomStatus(status)
  return v === 'vacant_dirty' || v === 'occupied_dirty'
}

/** Lấy nhóm hiển thị filter */
export function getRoomStatusGroup(status: string | null | undefined): RoomStatusGroup {
  return getRoomStatusMeta(status).group
}

/** Re-export cho convenience */
export type { RoomStatus, RoomStatusV2, RoomStatusLegacy }

/**
 * Class màu chấm (bg-*-500) cho mọi status — semantic, đồng bộ giữa
 * RoomGrid / MobileRoomsPage / RoomQuickViewDialog / ReceptionQuickDialog.
 * Suy ra từ ROOM_STATUS_META_V2.text bằng quy ước text-X-700 → bg-X-500.
 */
export function getRoomStatusDotClass(status: string | null | undefined): string {
  const txt = getRoomStatusMeta(status).text // ví dụ "text-emerald-700"
  return txt.replace(/^text-/, 'bg-').replace(/-\d+$/, '-500')
}

/**
 * Class màu chữ semantic (text-*-700) cho status — dùng cạnh tên/nhãn.
 * Đồng bộ với ROOM_STATUS_META_V2 (đã chuẩn hoá theo Navy Trust).
 */
export function getRoomStatusTextClass(status: string | null | undefined): string {
  return getRoomStatusMeta(status).text
}

