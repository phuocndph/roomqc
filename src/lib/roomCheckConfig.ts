/**
 * Room Check Configuration by Check Type
 * 
 * This config defines which actions are available for each check type
 * to optimize the workflow for different scenarios:
 * - Daily: Focus on cleanliness and restocking
 * - Check-in: Ensure room readiness before guest arrives
 * - Check-out: Full inventory check with damage/loss tracking
 * - Maintenance: Post-repair verification
 */

export type CheckType = 'daily' | 'checkin' | 'checkout' | 'maintenance' | 'delivery' | 'replenish'

/**
 * PHÂN BIỆT QUAN TRỌNG: "Thiếu" (missing) vs "Mất" (lost)
 * - missing = thiếu so với chuẩn, chưa rõ ai làm mất → báo cáo nội bộ + sinh phiếu bổ sung.
 *   Chỉ dùng ở Daily/Checkin (khi KHÔNG có khách trong phòng).
 * - lost    = khách đã ở và đồ biến mất → tính phí khách. CHỈ dùng ở Checkout.
 *
 * PHÂN BIỆT: "Hết" (empty) vs "Đã dùng" (consumed) — chỉ với consumable
 * - empty    = hết sạch, cần bổ sung. Dùng ở Daily.
 * - consumed = khách đã tiêu thụ (minibar, đồ ăn) → tính phí nếu chargeable. Dùng ở Checkout.
 */

// Linen actions
export type LinenAction = 'ok' | 'laundry' | 'add' | 'change' | 'lost' | 'missing' | 'damaged'

// Consumable actions
export type ConsumableAction = 'ok' | 'empty' | 'consumed' | 'missing' | 'lost'

// Equipment/Furniture actions
export type EquipmentAction = 'ok' | 'missing' | 'lost' | 'damaged'
export type FurnitureAction = 'ok' | 'missing' | 'lost' | 'damaged'

// Phase actions for 2-phase checkout
export interface PhaseActions {
  linen: LinenAction[]
  consumable: ConsumableAction[]
  equipment: EquipmentAction[]
  furniture: FurnitureAction[]
}

export interface CheckTypeConfig {
  label: string
  description: string
  headerColor: string
  headerTextColor: string
  linenActions: LinenAction[]
  consumableActions: ConsumableAction[]
  equipmentActions: EquipmentAction[]
  furnitureActions: FurnitureAction[]
  showBookingInfo: boolean
  allowDamageCharges: boolean
  blockOnDamaged: boolean
  requireInspection: boolean
  // NEW: Checkout 2-phase config
  hasIntermediateSubmit?: boolean      // Có gửi giữa chừng không (checkout only)
  phase1Actions?: PhaseActions         // Actions cho Phase 1 (tính phí)
  phase2Actions?: PhaseActions         // Actions cho Phase 2 (bổ sung)
}

export const CHECK_TYPE_CONFIG: Record<CheckType, CheckTypeConfig> = {
  daily: {
    label: 'Kiểm tra hàng ngày',
    description: 'Kiểm tra vệ sinh và đồ dùng thường ngày',
    headerColor: 'bg-blue-50 border-blue-200',
    headerTextColor: 'text-blue-700',
    linenActions: ['ok', 'missing', 'damaged'],         // OK / Thiếu / Hỏng
    consumableActions: ['ok', 'missing', 'empty'],      // OK / Thiếu / Hết
    equipmentActions: ['ok', 'missing', 'damaged'],    // OK / Thiếu / Hỏng
    furnitureActions: ['ok', 'missing', 'damaged'],
    showBookingInfo: false,
    allowDamageCharges: false,
    blockOnDamaged: false,
    requireInspection: false,
  },
  checkin: {
    label: 'Kiểm tra trước check-in',
    description: 'Đảm bảo phòng sẵn sàng cho khách',
    headerColor: 'bg-green-50 border-green-200',
    headerTextColor: 'text-green-700',
    linenActions: ['ok', 'missing', 'add', 'damaged'],   // OK / Thiếu / Thêm / Hỏng
    consumableActions: ['ok', 'missing'],                // OK / Thiếu (chưa cần "hết" vì khách chưa vào)
    equipmentActions: ['ok', 'missing', 'damaged'],      // OK / Thiếu / Hỏng
    furnitureActions: ['ok', 'missing', 'damaged'],
    showBookingInfo: true,
    allowDamageCharges: false,
    blockOnDamaged: true,                     // Cảnh báo nếu có đồ hỏng
    requireInspection: false,
  },
  checkout: {
    label: 'Kiểm tra checkout',
    description: 'Kiểm tra trước khi khách trả phòng + báo dọn dẹp',
    headerColor: 'bg-orange-50 border-orange-200',
    headerTextColor: 'text-orange-700',
    linenActions: ['ok', 'laundry', 'change', 'lost', 'damaged'], // Full actions
    consumableActions: ['ok', 'consumed', 'lost'],                 // Đã dùng, Mất
    equipmentActions: ['ok', 'lost', 'damaged'],                   // Full + charge
    furnitureActions: ['ok', 'lost', 'damaged'],
    showBookingInfo: true,
    allowDamageCharges: true,
    blockOnDamaged: false,
    requireInspection: true,
    // 2-phase checkout config
    hasIntermediateSubmit: true,
    phase1Actions: {
      linen: ['ok', 'lost', 'damaged'],           // Chỉ báo mất/hỏng
      consumable: ['ok', 'consumed', 'lost'],      // Đã dùng, mất
      equipment: ['ok', 'lost', 'damaged'],        // Mất, hỏng
      furniture: ['ok', 'lost', 'damaged'],
    },
    phase2Actions: {
      linen: ['ok', 'laundry', 'change', 'add'],   // Giặt, thay, thêm
      consumable: ['ok', 'empty'],                  // Hết → cần bổ sung
      equipment: ['ok'],                            // Đã báo ở phase 1
      furniture: ['ok'],
    },
  },
  maintenance: {
    label: 'Kiểm tra bảo trì',
    description: 'Kiểm tra sau sửa chữa',
    headerColor: 'bg-purple-50 border-purple-200',
    headerTextColor: 'text-purple-700',
    linenActions: ['ok', 'missing'],
    consumableActions: ['ok', 'missing'],
    equipmentActions: ['ok', 'damaged'],
    furnitureActions: ['ok', 'damaged'],
    showBookingInfo: false,
    allowDamageCharges: false,
    blockOnDamaged: false,
    requireInspection: false,
  },
  delivery: {
    label: 'Kiểm tra sau giao hàng',
    description: 'Xác nhận đồ đã giao và tình trạng phòng',
    headerColor: 'bg-cyan-50 border-cyan-200',
    headerTextColor: 'text-cyan-700',
    linenActions: ['ok', 'add', 'change'],        // OK, Thêm, Đổi
    consumableActions: ['ok', 'empty'],            // OK, Hết
    equipmentActions: ['ok'],
    furnitureActions: ['ok'],
    showBookingInfo: false,
    allowDamageCharges: false,
    blockOnDamaged: false,
    requireInspection: false,
  },
  replenish: {
    label: 'Bổ sung đồ & Dọn dẹp',
    description: 'Báo đồ cần bổ sung và tình trạng phòng',
    headerColor: 'bg-teal-50 border-teal-200',
    headerTextColor: 'text-teal-700',
    linenActions: ['ok', 'missing', 'add'],        // OK, Thiếu, Thêm
    consumableActions: ['ok', 'empty', 'missing'], // OK, Hết, Thiếu
    equipmentActions: ['ok', 'missing', 'damaged'],   // OK, Thiếu, Hỏng (báo cáo)
    furnitureActions: ['ok', 'missing', 'damaged'],
    showBookingInfo: false,
    allowDamageCharges: false,
    blockOnDamaged: false,
    requireInspection: false,
  },
}

/**
 * Get action labels for UI display
 */
export const ACTION_LABELS: Record<string, string> = {
  ok: 'Đạt',
  laundry: 'Đã giặt',
  add: 'Đã thêm',
  change: 'Đã thay',
  lost: 'Mất',
  damaged: 'Hỏng',
  missing: 'Thiếu',
  empty: 'Hết',
  consumed: 'Đã dùng',
}

/**
 * Get action colors for UI display
 */
export const ACTION_COLORS: Record<string, string> = {
  ok: 'text-green-600 hover:bg-green-50',
  laundry: 'text-blue-600 hover:bg-blue-50',
  add: 'text-green-600 hover:bg-green-50',
  change: 'text-primary hover:bg-primary/10',
  lost: 'text-destructive hover:bg-destructive/10',
  damaged: 'text-amber-600 hover:bg-amber-50',
  missing: 'text-yellow-600 hover:bg-yellow-50',
  empty: 'text-yellow-600 hover:bg-yellow-50',
  consumed: 'text-cyan-600 hover:bg-cyan-50',
}

/**
 * Get check type config with fallback
 */
export function getCheckTypeConfig(checkType: string): CheckTypeConfig {
  return CHECK_TYPE_CONFIG[checkType as CheckType] || CHECK_TYPE_CONFIG.daily
}
