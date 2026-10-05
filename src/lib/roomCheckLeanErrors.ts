/**
 * Mapping lỗi server (UPPER_SNAKE / lowercase tag) → thông điệp tiếng Việt cho UI Lean.
 * Tách ra module thuần để có thể unit-test mà không phải mock supabase.
 */
export interface MappedLeanError {
  message: string
  itemId?: string
}

export function mapLeanError(msg: string, rateLimitMin = 30): MappedLeanError {
  if (!msg) return { message: 'Đã có lỗi không xác định. Vui lòng thử lại.' }

  const photoMatch = msg.match(/photo_required:([a-z_]+)(?::([0-9a-f-]+))?/i)
  if (photoMatch) {
    const bucket = photoMatch[1]
    const itemId = photoMatch[2]
    const label =
      bucket === 'damaged_lost'
        ? 'Hỏng / Mất'
        : bucket === 'missing_replace'
          ? 'Thiếu / Cần thay'
          : bucket === 'consumed_chargeable'
            ? 'Khách đã dùng (tính phí)'
            : null
    return {
      message: label
        ? `Cần chụp ảnh bằng chứng cho mục ${label} trước khi gửi.`
        : 'Khách sạn yêu cầu chụp ảnh bằng chứng khi kiểm phòng.',
      itemId,
    }
  }

  const qtyMatch = msg.match(/invalid_quantity(?::([0-9a-f-]+))?/i)
  if (qtyMatch) {
    return {
      message: 'Số lượng phải lớn hơn 0. Vui lòng kiểm tra lại các mục đã nhập.',
      itemId: qtyMatch[1],
    }
  }

  // primary_quantity_exceeds_standard:<item_id>:<sum>:<standard>
  const exceedMatch = msg.match(
    /primary_quantity_exceeds_standard(?::([0-9a-f-]+))?(?::(\d+))?(?::(\d+))?/i,
  )
  if (exceedMatch) {
    return {
      message:
        'Tổng số lượng sự cố chính của một mục vượt quá số đồ chuẩn của phòng. Vui lòng giảm bớt hoặc gộp lại.',
      itemId: exceedMatch[1],
    }
  }

  if (msg.includes('conflict_room_updated'))
    return { message: 'Phòng này vừa có người cập nhật. Bạn cần tải lại trước khi gửi kết quả.' }
  if (msg.includes('invalid_check_type'))
    return { message: 'Loại kiểm phòng không hợp lệ.' }
  if (msg.includes('task_not_found'))
    return { message: 'Không tìm thấy công việc liên quan.' }
  if (msg.includes('quick_path_disabled'))
    return { message: 'Khách sạn đã tắt chế độ kiểm nhanh.' }
  if (msg.startsWith('quick_rate_limited') || msg.includes('quick_rate_limited:')) {
    const m = msg.match(/quick_rate_limited:(\d+)/)
    const min = m ? Number(m[1]) : rateLimitMin
    return { message: `Vừa có lần kiểm nhanh. Vui lòng đợi đủ ${min} phút giữa hai lần kiểm nhanh.` }
  }
  if (msg.includes('quick_path_not_allowed'))
    return { message: 'Loại kiểm này không hỗ trợ chế độ nhanh.' }
  if (msg.includes('forbidden_tenant'))
    return { message: 'Bạn không có quyền thao tác trên dữ liệu của khách sạn này.' }
  if (msg.includes('forbidden_role'))
    return { message: 'Bạn không có quyền thực hiện thao tác này.' }
  if (msg.includes('room_not_found')) return { message: 'Không tìm thấy phòng.' }
  if (msg.includes('check_not_found')) return { message: 'Không tìm thấy bản kiểm.' }
  if (msg.includes('unauthorized')) return { message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }
  return { message: msg }
}

// ───────────────────────── Draft sanitizer ─────────────────────────

export type LeanIssueKind = 'damaged' | 'lost' | 'missing' | 'consumed'
export type LeanIssueLevel1 = string
export type LeanIssueRole = 'primary_issue' | 'derived_action'

export interface SanitizedLeanIssue {
  /** Local id để key/edit — luôn được sinh nếu draft cũ thiếu */
  id: string
  item_id: string
  item_name: string
  item_type: string
  level1: LeanIssueLevel1
  kind: LeanIssueKind
  quantity: number
  photos: string[]
  chargeToGuest?: boolean
  notes?: string
  /** Đợt B */
  uiActionKey?: string
  subReasonKey?: string
  bucket?: string
  issueRole?: LeanIssueRole
  needsReview?: boolean
  assetGroup?: string
  derivedActionKey?: string
  extra?: Record<string, any>
}

export interface SanitizedLeanDraft {
  startedAt: string
  /** Multi-issue per item — array */
  issues: Record<string, SanitizedLeanIssue[]>
  minibar: Record<string, number>
}

const VALID_KINDS: LeanIssueKind[] = ['damaged', 'lost', 'missing', 'consumed']
const VALID_ROLES: LeanIssueRole[] = ['primary_issue', 'derived_action']

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID()
  }
  return `iss_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeOne(it: any): SanitizedLeanIssue | null {
  if (!it || typeof it !== 'object') return null
  const qty = Number(it.quantity)
  if (!it.item_id || !VALID_KINDS.includes(it.kind) || !Number.isFinite(qty) || qty <= 0) {
    return null
  }
  const role: LeanIssueRole = VALID_ROLES.includes(it.issueRole) ? it.issueRole : 'primary_issue'
  return {
    id: typeof it.id === 'string' && it.id ? it.id : genId(),
    item_id: String(it.item_id),
    item_name: String(it.item_name || ''),
    item_type: String(it.item_type || ''),
    level1: typeof it.level1 === 'string' ? it.level1 : 'damaged_lost',
    kind: it.kind,
    quantity: qty,
    photos: Array.isArray(it.photos) ? it.photos.filter((p: any) => typeof p === 'string') : [],
    chargeToGuest: typeof it.chargeToGuest === 'boolean' ? it.chargeToGuest : undefined,
    notes: typeof it.notes === 'string' ? it.notes : undefined,
    uiActionKey: typeof it.uiActionKey === 'string' ? it.uiActionKey : undefined,
    subReasonKey:
      typeof it.subReasonKey === 'string'
        ? it.subReasonKey
        // Backward compat: draft cũ dùng `subReason` (free-text). Bỏ qua text dài,
        // chỉ giữ nếu nhìn như enum key (chữ + dấu chấm/underscore).
        : typeof it.subReason === 'string' && /^[a-z0-9_.]{2,40}$/i.test(it.subReason)
          ? it.subReason
          : undefined,
    bucket: typeof it.bucket === 'string' ? it.bucket : undefined,
    issueRole: role,
    needsReview: typeof it.needsReview === 'boolean' ? it.needsReview : undefined,
    assetGroup: typeof it.assetGroup === 'string' ? it.assetGroup : undefined,
    derivedActionKey: typeof it.derivedActionKey === 'string' ? it.derivedActionKey : undefined,
    extra:
      it.extra && typeof it.extra === 'object' && !Array.isArray(it.extra) ? it.extra : undefined,
  }
}

/**
 * Chịu được draft thiếu/sai field. Drop entry không hợp lệ thay vì throw.
 * Hỗ trợ migration legacy: `issues[itemId] = LeanIssue` → `issues[itemId] = [LeanIssue]`.
 */
export function sanitizeLeanDraft(raw: unknown): SanitizedLeanDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as any
  const safeIssues: Record<string, SanitizedLeanIssue[]> = {}
  if (r.issues && typeof r.issues === 'object') {
    for (const [k, v] of Object.entries(r.issues)) {
      const list: SanitizedLeanIssue[] = []
      if (Array.isArray(v)) {
        for (const entry of v) {
          const s = sanitizeOne(entry)
          if (s) list.push(s)
        }
      } else {
        const s = sanitizeOne(v)
        if (s) list.push(s)
      }
      if (list.length > 0) safeIssues[k] = list
    }
  }
  const safeMinibar: Record<string, number> = {}
  if (r.minibar && typeof r.minibar === 'object') {
    for (const [k, v] of Object.entries(r.minibar)) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) safeMinibar[k] = n
    }
  }
  return {
    startedAt: typeof r.startedAt === 'string' ? r.startedAt : new Date().toISOString(),
    issues: safeIssues,
    minibar: safeMinibar,
  }
}

/** Helper: flatten issues object → array */
export function flattenIssues(
  issues: Record<string, SanitizedLeanIssue[]>,
): SanitizedLeanIssue[] {
  return Object.values(issues).flat()
}

// ───────── Pre-submit validation theo per-hotel config ─────────

export interface LeanPhotoConfig {
  photo_required_damaged_lost: boolean
  photo_required_missing_replace: boolean
  photo_required_consumed_chargeable: boolean
}

export interface PreSubmitInput {
  /** Chấp nhận cả array (đã flatten) cho gọn */
  issues: SanitizedLeanIssue[]
  config?: LeanPhotoConfig | null
  /** Map item_id → standard_quantity của phòng — dùng cho constraint §8.3 */
  standardByItem?: Record<string, number>
}

export interface PreSubmitError {
  code:
    | 'invalid_quantity'
    | 'photo_required:damaged_lost'
    | 'photo_required:missing_replace'
    | 'photo_required:consumed_chargeable'
    | 'primary_quantity_exceeds_standard'
  itemId?: string
  itemName: string
  message: string
}

/**
 * Trả về null nếu OK, hoặc lỗi đầu tiên gặp phải (item-level).
 *
 * Thứ tự kiểm:
 *  1. quantity > 0
 *  2. constraint §8.3: sum(primary_issue.quantity by item) ≤ standard_quantity
 *  3. photo per kind theo per-hotel config
 */
export function preSubmitValidate({
  issues,
  config,
  standardByItem,
}: PreSubmitInput): PreSubmitError | null {
  const badQty = issues.find((i) => !(Number(i.quantity) > 0))
  if (badQty) {
    return {
      code: 'invalid_quantity',
      itemId: badQty.item_id,
      itemName: badQty.item_name || 'một mục',
      message: `Số lượng phải lớn hơn 0 cho "${badQty.item_name || 'một mục đã ghi'}".`,
    }
  }

  // §8.3 — chỉ tính primary_issue
  if (standardByItem) {
    const sumByItem: Record<string, { qty: number; name: string }> = {}
    for (const i of issues) {
      const role = i.issueRole ?? 'primary_issue'
      if (role !== 'primary_issue') continue
      const cur = sumByItem[i.item_id] ?? { qty: 0, name: i.item_name }
      cur.qty += Number(i.quantity) || 0
      sumByItem[i.item_id] = cur
    }
    for (const [itemId, agg] of Object.entries(sumByItem)) {
      const std = standardByItem[itemId]
      if (typeof std === 'number' && std > 0 && agg.qty > std) {
        return {
          code: 'primary_quantity_exceeds_standard',
          itemId,
          itemName: agg.name,
          message: `"${agg.name}": tổng số lượng sự cố chính (${agg.qty}) vượt quá số đồ chuẩn của phòng (${std}). Hãy gộp lại hoặc giảm bớt.`,
        }
      }
    }
  }

  if (!config) return null

  if (config.photo_required_damaged_lost) {
    const miss = issues.find(
      (i) => (i.kind === 'damaged' || i.kind === 'lost') && (!i.photos || i.photos.length === 0),
    )
    if (miss) {
      return {
        code: 'photo_required:damaged_lost',
        itemId: miss.item_id,
        itemName: miss.item_name,
        message: `Cần chụp ảnh bằng chứng cho "${miss.item_name}" (Hỏng / Mất).`,
      }
    }
  }
  if (config.photo_required_missing_replace) {
    const miss = issues.find(
      (i) => i.kind === 'missing' && (!i.photos || i.photos.length === 0),
    )
    if (miss) {
      return {
        code: 'photo_required:missing_replace',
        itemId: miss.item_id,
        itemName: miss.item_name,
        message: `Cần chụp ảnh bằng chứng cho "${miss.item_name}" (Thiếu / Cần thay).`,
      }
    }
  }
  if (config.photo_required_consumed_chargeable) {
    const miss = issues.find(
      (i) =>
        i.kind === 'consumed' &&
        (i.chargeToGuest ?? true) &&
        (!i.photos || i.photos.length === 0),
    )
    if (miss) {
      return {
        code: 'photo_required:consumed_chargeable',
        itemId: miss.item_id,
        itemName: miss.item_name,
        message: `Cần chụp ảnh bằng chứng cho "${miss.item_name}" (Khách đã dùng – tính phí).`,
      }
    }
  }
  return null
}
