/**
 * Issue UI → Bucket mapping (Decision v1.2 §6.3 + §7)
 *
 * Phase B1 — Chuẩn hoá:
 *  - L1: tối đa 4 primary options/group, KHÔNG còn UNKNOWN nối thêm
 *    (mỗi group đã có 1 option "Chưa rõ" trong 4 lựa chọn).
 *  - Sub-reasons: ENUM list (radio), không free-text.
 *  - resolveBucket: nhận `actionKey` (L1) HOẶC `actionKey + subReasonKey` →
 *    BucketResolution có thể merge từ sub-reason override.
 */
import type { AssetGroup, IssueBucket } from '@/types/assetGroup.types'

export type IssueRole = 'primary_issue' | 'derived_action'

export interface BucketResolution {
  bucket: IssueBucket
  issue_role: IssueRole
  needs_review: boolean
  /** photo_required override (nếu unset → dùng per-hotel policy theo bucket) */
  photo_required?: boolean
  extra?: Record<string, any>
}

export interface SubReason {
  key: string
  label: string
  /** Override một phần BucketResolution */
  override?: Partial<BucketResolution>
  /** Derived action sinh kèm khi chọn sub-reason này (vd: vỡ ly → supplement) */
  derivedActionKey?: string
}

export interface L1Option {
  key: string
  title: string
  example: string
  /** Bucket mặc định khi chỉ chọn L1 */
  defaultResolution: BucketResolution
  /** Nếu có → buộc chọn 1 sub-reason trước khi submit */
  subReasons?: SubReason[]
  /** Toggle "Tính phí khách" mặc định */
  defaultCharge?: boolean
  /** Derived action mặc định (sinh issue_role='derived_action' khi submit) */
  derivedActionKey?: string
}

// ============================================================================
// Matrix §6.3 — 4 primary options/group (đã include lựa chọn "Chưa rõ")
// ============================================================================

export const L1_BY_GROUP: Record<AssetGroup, L1Option[]> = {
  // ─── LINEN ───
  linen: [
    {
      key: 'linen.send_laundry',
      title: 'Gửi giặt',
      example: 'Khăn / ga đã dùng cần giặt',
      defaultResolution: {
        bucket: 'items_sent_to_laundry',
        issue_role: 'primary_issue',
        needs_review: false,
      },
    },
    {
      key: 'linen.need_more',
      title: 'Cần bổ sung',
      example: 'Khách yêu cầu thêm khăn / ga / gối',
      defaultResolution: {
        bucket: 'items_replaced',
        issue_role: 'primary_issue',
        needs_review: false,
      },
    },
    {
      key: 'linen.damaged_dirty',
      title: 'Hỏng / bẩn nặng',
      example: 'Vết bẩn không xử lý được, rách, hết tuổi thọ',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
      },
      subReasons: [
        {
          key: 'dirty_unprocessable',
          label: 'Bẩn không xử lý được',
          override: {
            bucket: 'items_sent_to_laundry',
            extra: { quality_issue: true },
            photo_required: true,
          },
        },
        {
          key: 'torn',
          label: 'Rách / hỏng',
          override: { extra: { reason: 'torn' }, photo_required: true },
        },
        {
          key: 'lifecycle_end',
          label: 'Hết tuổi thọ',
          override: { extra: { retire_reason: 'lifecycle' } },
        },
        {
          key: 'unknown',
          label: 'Chưa rõ — gửi quản lý xem xét',
          override: { needs_review: true, extra: { unknown_cause: true } },
        },
      ],
    },
    {
      key: 'linen.lost_unknown',
      title: 'Mất / chưa rõ',
      example: 'Không thấy trong phòng, thiếu so với setup',
      defaultResolution: {
        bucket: 'items_lost',
        issue_role: 'primary_issue',
        needs_review: true,
      },
      subReasons: [
        { key: 'not_in_room', label: 'Không thấy trong phòng' },
        {
          key: 'missing_setup',
          label: 'Thiếu so với setup',
          override: { bucket: 'items_missing' },
        },
        {
          key: 'unknown',
          label: 'Chưa rõ — gửi quản lý xem xét',
          override: { needs_review: true, extra: { unknown_cause: true } },
        },
      ],
    },
  ],

  // ─── CONSUMABLE_FREE ───
  consumable_free: [
    {
      key: 'consumable_free.refill',
      title: 'Cần bổ sung',
      example: 'Đặt thêm nước, dầu gội, kem đánh răng',
      defaultResolution: {
        bucket: 'items_replaced',
        issue_role: 'primary_issue',
        needs_review: false,
      },
    },
    {
      key: 'consumable_free.missing_setup',
      title: 'Thiếu khi nhận phòng',
      example: 'Thiếu so với setup chuẩn',
      defaultResolution: {
        bucket: 'items_missing',
        issue_role: 'primary_issue',
        needs_review: true,
      },
    },
    {
      key: 'consumable_free.suspicious_take',
      title: 'Khách lấy bất thường',
      example: 'Số lượng giảm bất thường so với mức dùng',
      defaultResolution: {
        bucket: 'items_lost',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { suspicious: true },
      },
    },
    {
      key: 'consumable_free.unknown',
      title: 'Chưa rõ',
      example: 'Không xác định nguyên nhân — quản lý sẽ xem',
      defaultResolution: {
        bucket: 'items_missing',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { unknown_cause: true },
      },
    },
  ],

  // ─── MINIBAR ───
  minibar: [
    {
      key: 'minibar.consumed_by_guest',
      title: 'Khách đã dùng',
      example: 'Bia, snack, mì gói — sẽ tính phí',
      defaultCharge: true,
      defaultResolution: {
        bucket: 'items_consumed',
        issue_role: 'primary_issue',
        needs_review: false,
        extra: { charge_to_guest: true, charge_status: 'pending_fo_confirm' },
      },
    },
    {
      key: 'minibar.refill',
      title: 'Cần bổ sung',
      example: 'Bổ sung lô mới cho khách kế tiếp',
      defaultResolution: {
        bucket: 'items_replaced',
        issue_role: 'primary_issue',
        needs_review: false,
      },
    },
    {
      key: 'minibar.expired',
      title: 'Hết hạn',
      example: 'Cần huỷ và bổ sung lô mới',
      defaultResolution: {
        bucket: 'items_lost',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { reason: 'expired', charge_to_guest: false },
      },
    },
    {
      key: 'minibar.missing_setup',
      title: 'Thiếu khi setup',
      example: 'Chưa có sẵn lúc khách nhận phòng — không tính phí',
      defaultResolution: {
        bucket: 'items_missing',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { charge_to_guest: false },
      },
    },
  ],

  // ─── STATIONERY ───
  stationery: [
    {
      key: 'stationery.refill',
      title: 'Cần bổ sung',
      example: 'Bút, giấy note, phong bì',
      defaultResolution: {
        bucket: 'items_replaced',
        issue_role: 'primary_issue',
        needs_review: false,
      },
    },
    {
      key: 'stationery.missing_setup',
      title: 'Thiếu khi nhận phòng',
      example: 'Thiếu so với setup chuẩn',
      defaultResolution: {
        bucket: 'items_missing',
        issue_role: 'primary_issue',
        needs_review: false,
      },
    },
    {
      key: 'stationery.damaged',
      title: 'Hỏng / bẩn',
      example: 'Sổ rách, bút hết mực, giấy ố vàng',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: false,
      },
    },
    {
      key: 'stationery.unknown',
      title: 'Chưa rõ',
      example: 'Không xác định — quản lý sẽ xem',
      defaultResolution: {
        bucket: 'items_missing',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { unknown_cause: true },
      },
    },
  ],

  // ─── EQUIPMENT_LARGE ───
  equipment_large: [
    {
      key: 'equipment_large.broken',
      title: 'Hỏng cần bảo trì',
      example: 'TV, điều hoà, tủ lạnh không chạy',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        photo_required: true,
        extra: { create_maintenance: true, priority: 'high' },
      },
    },
    {
      key: 'equipment_large.intermittent',
      title: 'Hoạt động không ổn định',
      example: 'Điều hoà yếu, TV chập chờn, tủ lạnh không lạnh đều',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { create_maintenance: true, priority: 'medium', reason: 'intermittent' },
      },
    },
    {
      key: 'equipment_large.lost',
      title: 'Mất',
      example: 'Không còn trong phòng — báo manager',
      defaultResolution: {
        bucket: 'items_lost',
        issue_role: 'primary_issue',
        needs_review: true,
      },
    },
    {
      key: 'equipment_large.unknown',
      title: 'Chưa rõ',
      example: 'Không xác định nguyên nhân',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { unknown_cause: true },
      },
    },
  ],

  // ─── ELECTRONIC_ACCESSORY ───
  electronic_accessory: [
    {
      key: 'electronic_accessory.lost',
      title: 'Mất',
      example: 'Remote, dây sạc, cốc sạc',
      defaultResolution: {
        bucket: 'items_lost',
        issue_role: 'primary_issue',
        needs_review: true,
      },
    },
    {
      key: 'electronic_accessory.broken',
      title: 'Hỏng',
      example: 'Remote không bấm được, sạc không vào điện',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        photo_required: true,
      },
    },
    {
      key: 'electronic_accessory.battery_replacement',
      title: 'Cần thay pin / phụ kiện',
      example: 'Hết pin remote, dây cũ cần thay',
      defaultResolution: {
        bucket: 'items_replaced',
        issue_role: 'primary_issue',
        needs_review: false,
        extra: { reason: 'battery' },
      },
    },
    {
      key: 'electronic_accessory.unknown',
      title: 'Chưa rõ',
      example: 'Không xác định — quản lý sẽ xem',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { unknown_cause: true },
      },
    },
  ],

  // ─── FURNITURE ───
  furniture: [
    {
      key: 'furniture.broken',
      title: 'Hỏng cần bảo trì',
      example: 'Ghế gãy chân, bàn nứt, tủ kẹt',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        photo_required: true,
        extra: { create_maintenance: true },
      },
    },
    {
      key: 'furniture.stained',
      title: 'Bẩn nặng',
      example: 'Sofa dính rượu, ga đệm vết loang',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        photo_required: true,
        extra: { reason: 'stained' },
      },
    },
    {
      key: 'furniture.needs_replacement',
      title: 'Cần thay thế',
      example: 'Quá cũ, không sửa được nữa',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { reason: 'replace', retire: true },
      },
    },
    {
      key: 'furniture.unknown',
      title: 'Chưa rõ',
      example: 'Không xác định — quản lý sẽ xem',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { unknown_cause: true },
      },
    },
  ],

  // ─── GLASSWARE ───
  glassware: [
    {
      key: 'glassware.broken',
      title: 'Vỡ',
      example: 'Cốc, ly, bình hoa',
      // Vỡ → primary damaged + derived supplement
      derivedActionKey: 'glassware.replace',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: false,
        photo_required: true,
        extra: { retire: true },
      },
    },
    {
      key: 'glassware.lost',
      title: 'Mất',
      example: 'Không còn trong phòng',
      defaultResolution: {
        bucket: 'items_lost',
        issue_role: 'primary_issue',
        needs_review: true,
      },
    },
    {
      key: 'glassware.refill',
      title: 'Cần bổ sung',
      example: 'Đặt thêm cho khách',
      defaultResolution: {
        bucket: 'items_replaced',
        issue_role: 'primary_issue',
        needs_review: false,
      },
    },
    {
      key: 'glassware.unknown',
      title: 'Chưa rõ',
      example: 'Không xác định — quản lý sẽ xem',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { unknown_cause: true },
      },
    },
  ],

  // ─── BATHROOM_HARDWARE ───
  bathroom_hardware: [
    {
      key: 'bathroom_hardware.broken',
      title: 'Hỏng cần bảo trì',
      example: 'Vòi sen, gương, chậu rửa hỏng',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        photo_required: true,
        extra: { create_maintenance: true, priority: 'high' },
      },
    },
    {
      key: 'bathroom_hardware.intermittent',
      title: 'Hoạt động không ổn định',
      example: 'Vòi yếu, đèn nháy, cửa kẹt nhẹ',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { create_maintenance: true, priority: 'medium', reason: 'intermittent' },
      },
    },
    {
      key: 'bathroom_hardware.stained',
      title: 'Bẩn nặng',
      example: 'Vết ố không tẩy được, gương mốc',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        photo_required: true,
        extra: { reason: 'stained' },
      },
    },
    {
      key: 'bathroom_hardware.unknown',
      title: 'Chưa rõ',
      example: 'Không xác định — quản lý sẽ xem',
      defaultResolution: {
        bucket: 'items_damaged',
        issue_role: 'primary_issue',
        needs_review: true,
        extra: { unknown_cause: true },
      },
    },
  ],
}

/** Trả về L1 options cho 1 group (đã đảm bảo 4 lựa chọn) */
export function getL1Options(group: AssetGroup): L1Option[] {
  return L1_BY_GROUP[group] ?? []
}

/** Tìm L1Option theo actionKey */
export function findL1Option(actionKey: string): L1Option | undefined {
  for (const opts of Object.values(L1_BY_GROUP)) {
    const f = opts.find((o) => o.key === actionKey)
    if (f) return f
  }
  return undefined
}

/**
 * Resolve final BucketResolution.
 * - Nếu chỉ có actionKey: trả `defaultResolution`.
 * - Nếu có thêm subReasonKey: merge override (extra cũng merge nông).
 */
export function resolveBucket(
  actionKey: string,
  subReasonKey?: string,
): BucketResolution {
  const l1 = findL1Option(actionKey)
  if (!l1) {
    // Legacy fallback (giữ tương thích keys cũ chưa migrate)
    return {
      bucket: 'items_damaged',
      issue_role: 'primary_issue',
      needs_review: true,
      extra: { fallback_action: actionKey },
    }
  }
  const base = l1.defaultResolution
  if (!subReasonKey || !l1.subReasons) return base
  const sr = l1.subReasons.find((s) => s.key === subReasonKey)
  if (!sr || !sr.override) return base
  return {
    ...base,
    ...sr.override,
    extra: { ...(base.extra ?? {}), ...(sr.override.extra ?? {}) },
  }
}

/** Có cần buộc chọn sub-reason cho L1 này không */
export function requiresSubReason(actionKey: string): boolean {
  const l1 = findL1Option(actionKey)
  return !!l1?.subReasons && l1.subReasons.length > 0
}

/** Lấy derived action (nếu có) sau khi resolve. Trả về key hoặc null. */
export function getDerivedActionKey(
  actionKey: string,
  subReasonKey?: string,
): string | null {
  const l1 = findL1Option(actionKey)
  if (!l1) return null
  if (subReasonKey && l1.subReasons) {
    const sr = l1.subReasons.find((s) => s.key === subReasonKey)
    if (sr?.derivedActionKey) return sr.derivedActionKey
  }
  return l1.derivedActionKey ?? null
}
