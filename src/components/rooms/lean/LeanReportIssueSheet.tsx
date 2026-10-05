import { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useImageUpload } from '@/hooks/useImageUpload'
import { useUser } from '@/hooks/useUser'
import { toast } from 'sonner'
import type { ItemType } from '@/types/items.types'
import type { AssetGroup } from '@/types/assetGroup.types'
import {
  getL1Options,
  findL1Option,
  resolveBucket,
  requiresSubReason,
  getDerivedActionKey,
  type L1Option,
  type BucketResolution,
} from '@/lib/issueBucketMapping'
import { SubReasonPicker } from './SubReasonPicker'

/**
 * LeanReportIssueSheet — Phase B1.
 *
 * Đường đi:
 *  1. L1 (4 lựa chọn theo asset_group)
 *  2. Sub-reason ENUM (radio) nếu L1 yêu cầu
 *  3. Stepper số lượng + ảnh + tính phí + ghi chú
 *
 * Backward compatible: nếu KHÔNG truyền `assetGroup` → fallback legacy 3 lựa chọn lớn
 * (giữ cho luồng cũ chưa migrate sang asset_group).
 */

export type LeanIssueLevel1 =
  | 'damaged_lost'
  | 'missing_replace'
  | 'consumed_chargeable'
  | string

export interface LeanIssueResult {
  level1: LeanIssueLevel1
  /** Map về kind cũ để giữ tương thích với code render hiện tại */
  kind: 'damaged' | 'lost' | 'missing' | 'consumed'
  quantity: number
  photos: string[]
  chargeToGuest?: boolean
  notes?: string
  uiActionKey?: string
  /** ENUM key, không còn free-text */
  subReasonKey?: string
  bucket?: string
  issueRole?: 'primary_issue' | 'derived_action'
  needsReview?: boolean
  assetGroup?: AssetGroup
  /** Derived action sinh thêm (nếu có) — parent dùng để insert issue_role='derived_action' */
  derivedActionKey?: string
  extra?: Record<string, any>
}

export interface LeanReportIssueSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  itemType: ItemType
  standardQuantity: number
  assetGroup?: AssetGroup | null
  /** Per-hotel rule fallback theo bucket */
  photoRequiredFor: {
    damaged_lost: boolean
    missing_replace: boolean
    consumed_chargeable: boolean
  }
  initial?: Partial<LeanIssueResult> | null
  onSubmit: (result: LeanIssueResult) => void
}

// ── Legacy fallback (3 lựa chọn) khi không có asset_group ──
const LEGACY_L1: L1Option[] = [
  {
    key: 'damaged_lost',
    title: 'Đồ hỏng / mất',
    example: 'Ví dụ: TV không lên, mất khăn tắm',
    defaultResolution: {
      bucket: 'items_damaged',
      issue_role: 'primary_issue',
      needs_review: true,
    },
  },
  {
    key: 'missing_replace',
    title: 'Thiếu / cần thay',
    example: 'Ví dụ: Thiếu 1 gối, cần thay ga giường',
    defaultResolution: {
      bucket: 'items_missing',
      issue_role: 'primary_issue',
      needs_review: false,
    },
  },
  {
    key: 'consumed_chargeable',
    title: 'Khách đã dùng / cần ghi nhận',
    example: 'Ví dụ: Khách dùng 2 nước suối minibar',
    defaultCharge: true,
    defaultResolution: {
      bucket: 'items_consumed',
      issue_role: 'primary_issue',
      needs_review: false,
    },
  },
]

function bucketToKind(bucket: string): LeanIssueResult['kind'] {
  if (bucket === 'items_lost') return 'lost'
  if (bucket === 'items_missing') return 'missing'
  if (bucket === 'items_consumed') return 'consumed'
  if (bucket === 'items_replaced') return 'missing'
  if (bucket === 'items_sent_to_laundry') return 'missing'
  return 'damaged'
}

function isPhotoRequired(
  resolution: BucketResolution,
  photoRequiredFor: LeanReportIssueSheetProps['photoRequiredFor'],
): boolean {
  if (resolution.photo_required !== undefined) return resolution.photo_required
  if (resolution.bucket === 'items_damaged' || resolution.bucket === 'items_lost') {
    return photoRequiredFor.damaged_lost
  }
  if (
    resolution.bucket === 'items_missing' ||
    resolution.bucket === 'items_replaced' ||
    resolution.bucket === 'items_sent_to_laundry'
  ) {
    return photoRequiredFor.missing_replace
  }
  if (resolution.bucket === 'items_consumed') {
    return photoRequiredFor.consumed_chargeable
  }
  return false
}

function showChargeToggleFor(resolution: BucketResolution, group?: AssetGroup | null) {
  // Chỉ hiển thị toggle với minibar / consumed / lost+missing có khả năng tính phí
  if (group === 'minibar') return true
  if (resolution.bucket === 'items_consumed') return true
  return false
}

export function LeanReportIssueSheet({
  open,
  onOpenChange,
  itemName,
  itemType,
  standardQuantity,
  assetGroup,
  photoRequiredFor,
  initial,
  onSubmit,
}: LeanReportIssueSheetProps) {
  const useAssetMode = !!assetGroup
  const l1Options = useMemo<L1Option[]>(
    () => (useAssetMode ? getL1Options(assetGroup as AssetGroup) : LEGACY_L1),
    [useAssetMode, assetGroup],
  )

  const [level1, setLevel1] = useState<string | null>(null)
  const [subReasonKey, setSubReasonKey] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [photos, setPhotos] = useState<string[]>([])
  const [chargeToGuest, setChargeToGuest] = useState<boolean>(true)
  const [notes, setNotes] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { tenantId } = useUser()
  const { uploadImage, isUploading } = useImageUpload()

  // Hydrate khi mở
  useEffect(() => {
    if (!open) return
    const lvl = (initial?.level1 as string) ?? null
    setLevel1(lvl)
    setSubReasonKey(initial?.subReasonKey ?? null)
    setQuantity(Math.max(1, initial?.quantity ?? 1))
    setPhotos(initial?.photos ?? [])
    const opt = l1Options.find((o) => o.key === lvl)
    setChargeToGuest(initial?.chargeToGuest ?? opt?.defaultCharge ?? false)
    setNotes(initial?.notes ?? '')
    setUploadError(null)
  }, [open, initial, l1Options])

  // Đổi L1 → reset subReason + chargeToGuest theo default
  const lastLevelRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open) return
    if (lastLevelRef.current === level1) return
    lastLevelRef.current = level1
    if (!level1) return
    setSubReasonKey(null)
    const opt = l1Options.find((o) => o.key === level1)
    if (opt?.defaultCharge !== undefined) setChargeToGuest(opt.defaultCharge)
  }, [level1, open, l1Options])

  const currentL1 = useMemo(() => (level1 ? findL1Option(level1) : undefined) ?? l1Options.find((o) => o.key === level1), [level1, l1Options])

  const needSubReason = useMemo(
    () => (level1 ? requiresSubReason(level1) : false),
    [level1],
  )

  const resolution = useMemo<BucketResolution | null>(() => {
    if (!level1) return null
    if (useAssetMode) return resolveBucket(level1, subReasonKey ?? undefined)
    return currentL1?.defaultResolution ?? null
  }, [level1, subReasonKey, useAssetMode, currentL1])

  const photoRequired = useMemo(
    () => (resolution ? isPhotoRequired(resolution, photoRequiredFor) : false),
    [resolution, photoRequiredFor],
  )

  const showChargeToggle = useMemo(() => {
    if (!resolution) return false
    if (!useAssetMode) {
      return level1 === 'consumed_chargeable' || level1 === 'damaged_lost'
    }
    return showChargeToggleFor(resolution, assetGroup)
  }, [resolution, useAssetMode, level1, assetGroup])

  const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !tenantId) return
    setUploadError(null)
    try {
      const uploaded = await uploadImage(file, tenantId)
      if (uploaded?.url) setPhotos((p) => [...p, uploaded.url])
    } catch {
      setUploadError('Ảnh chưa gửi lên được. Bạn có thể thử lại hoặc chụp ảnh khác.')
    } finally {
      e.target.value = ''
    }
  }

  const handleSubmit = () => {
    if (!level1 || !resolution) return
    if (quantity < 1) {
      toast.error('Chọn số lượng cần xử lý.')
      return
    }
    if (needSubReason && !subReasonKey) {
      toast.error('Chọn lý do cụ thể trước khi lưu.')
      return
    }
    if (photoRequired && photos.length === 0) {
      toast.error('Mục này cần ít nhất 1 ảnh để gửi.')
      return
    }

    const derivedActionKey = useAssetMode
      ? getDerivedActionKey(level1, subReasonKey ?? undefined)
      : null

    onSubmit({
      level1,
      kind: bucketToKind(resolution.bucket),
      quantity,
      photos,
      chargeToGuest: showChargeToggle ? chargeToGuest : undefined,
      notes: notes.trim() || undefined,
      uiActionKey: useAssetMode ? level1 : undefined,
      subReasonKey: subReasonKey ?? undefined,
      bucket: resolution.bucket,
      issueRole: resolution.issue_role,
      needsReview: resolution.needs_review,
      assetGroup: useAssetMode ? (assetGroup as AssetGroup) : undefined,
      derivedActionKey: derivedActionKey ?? undefined,
      extra: resolution.extra,
    })
    onOpenChange(false)
  }

  // Khi đang ở sub-reason step → nút back về L1
  const showSubReasonStep = !!level1 && needSubReason && !subReasonKey

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 max-h-[92vh] overflow-y-auto"
      >
        <div className="mx-auto w-10 h-1 bg-muted rounded-full mt-2 mb-3" />
        <SheetHeader className="px-4 pb-3 text-left">
          <SheetTitle className="text-[20px] font-bold leading-tight">
            {itemName}
          </SheetTitle>
          <SheetDescription className="text-[14px] text-muted-foreground">
            Tiêu chuẩn: {standardQuantity}
          </SheetDescription>
        </SheetHeader>

        {/* ── L1: 4 lựa chọn ── */}
        {!level1 && (
          <div className="px-4 pb-6 space-y-3">
            <p className="text-[16px] text-muted-foreground">Chọn loại vấn đề</p>
            {l1Options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setLevel1(opt.key)}
                className="w-full text-left rounded-xl border-2 px-4 py-4 active:bg-muted/50 hover:bg-muted/30 transition-colors"
                style={{ minHeight: 72 }}
              >
                <div className="text-[18px] font-semibold leading-tight">
                  {opt.title}
                </div>
                <div className="text-[14px] text-muted-foreground mt-1">
                  {opt.example}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Sub-reason step ── */}
        {showSubReasonStep && currentL1?.subReasons && (
          <div className="px-4 pb-6 space-y-5">
            <button
              type="button"
              onClick={() => setLevel1(null)}
              className="rounded-lg border-2 px-4 py-2 text-[15px] font-semibold text-foreground active:bg-muted/50"
              style={{ minHeight: 44 }}
            >
              ← Đổi loại vấn đề
            </button>
            <div className="rounded-lg bg-muted/30 px-3 py-2">
              <div className="text-[15px] font-semibold">{currentL1.title}</div>
              <div className="text-[13px] text-muted-foreground">
                {currentL1.example}
              </div>
            </div>
            <SubReasonPicker
              options={currentL1.subReasons}
              value={subReasonKey}
              onChange={setSubReasonKey}
            />
          </div>
        )}

        {/* ── Form chính: stepper / ảnh / charge / note ── */}
        {level1 && (!needSubReason || subReasonKey) && (
          <div className="px-4 pb-6 space-y-5">
            <button
              type="button"
              onClick={() => {
                if (needSubReason) {
                  setSubReasonKey(null)
                } else {
                  setLevel1(null)
                }
              }}
              className="rounded-lg border-2 px-4 py-2 text-[15px] font-semibold text-foreground active:bg-muted/50"
              style={{ minHeight: 44 }}
            >
              ← {needSubReason ? 'Đổi lý do' : 'Đổi loại vấn đề'}
            </button>

            {needSubReason && currentL1?.subReasons && (
              <div className="rounded-lg bg-muted/30 px-3 py-2">
                <div className="text-[13px] text-muted-foreground">
                  {currentL1.title}
                </div>
                <div className="text-[15px] font-semibold">
                  {currentL1.subReasons.find((s) => s.key === subReasonKey)?.label}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <Label className="text-[14px] font-semibold">Số lượng</Label>
              <div className="mt-2 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="rounded-xl border-2 text-2xl font-bold disabled:opacity-40 active:bg-muted/50"
                  style={{ width: 56, height: 56 }}
                  aria-label="Giảm"
                >
                  −
                </button>
                <div
                  className="text-center font-bold tabular-nums"
                  style={{ minWidth: 80, fontSize: 32 }}
                >
                  {quantity}
                </div>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="rounded-xl border-2 text-2xl font-bold active:bg-muted/50"
                  style={{ width: 56, height: 56 }}
                  aria-label="Tăng"
                >
                  +
                </button>
              </div>
              {quantity > standardQuantity && (
                <p className="mt-2 text-[13px] text-amber-600 text-center">
                  Vượt tiêu chuẩn ({standardQuantity})
                </p>
              )}
            </div>

            {/* Ảnh */}
            <div>
              <Label className="text-[14px] font-semibold">
                {photoRequired ? 'Ảnh (bắt buộc)' : 'Ảnh (nếu cần)'}
              </Label>

              {photos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {photos.map((url, i) => (
                    <div key={i} className="relative w-20 h-20">
                      <img
                        src={url}
                        alt=""
                        className="w-20 h-20 object-cover rounded-md border"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPhotos((p) => p.filter((_, idx) => idx !== i))
                        }
                        aria-label="Xoá ảnh"
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <label
                  className={cn(
                    'rounded-xl border-2 flex items-center justify-center font-semibold text-[15px] cursor-pointer active:bg-muted/50',
                    isUploading && 'opacity-60 cursor-not-allowed',
                  )}
                  style={{ minHeight: 52 }}
                >
                  {isUploading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang gửi...
                    </span>
                  ) : (
                    'Chụp ảnh'
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePickPhoto}
                    disabled={isUploading}
                  />
                </label>
                <label
                  className={cn(
                    'rounded-xl border-2 flex items-center justify-center font-semibold text-[15px] cursor-pointer active:bg-muted/50',
                    isUploading && 'opacity-60 cursor-not-allowed',
                  )}
                  style={{ minHeight: 52 }}
                >
                  {isUploading ? '...' : 'Chọn từ máy'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePickPhoto}
                    disabled={isUploading}
                  />
                </label>
              </div>

              {uploadError && (
                <p className="mt-2 text-[13px] text-destructive">{uploadError}</p>
              )}
              {photoRequired && photos.length === 0 && !uploadError && (
                <p className="mt-2 text-[13px] text-destructive">
                  Mục này cần ít nhất 1 ảnh để gửi.
                </p>
              )}
            </div>

            {/* Charge toggle */}
            {showChargeToggle && (
              <div>
                <Label className="text-[14px] font-semibold">Tính phí khách?</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChargeToGuest(true)}
                    className={cn(
                      'rounded-xl border-2 font-semibold text-[16px] active:bg-muted/50',
                      chargeToGuest
                        ? 'border-primary text-primary bg-primary/5'
                        : 'border-border bg-background text-foreground',
                    )}
                    style={{ minHeight: 56 }}
                  >
                    Có
                  </button>
                  <button
                    type="button"
                    onClick={() => setChargeToGuest(false)}
                    className={cn(
                      'rounded-xl border-2 font-semibold text-[16px] active:bg-muted/50',
                      !chargeToGuest
                        ? 'border-primary text-primary bg-primary/5'
                        : 'border-border bg-background text-foreground',
                    )}
                    style={{ minHeight: 56 }}
                  >
                    Không
                  </button>
                </div>
              </div>
            )}

            {/* Note */}
            <div>
              <Label className="text-[14px] font-semibold">Ghi chú (tuỳ chọn)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ví dụ: Thiếu 1 khăn tắm lớn"
                className="mt-2 text-[16px] resize-none"
                rows={3}
              />
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                type="button"
                onClick={handleSubmit}
                className="w-full font-semibold text-[18px]"
                style={{ minHeight: 56 }}
                disabled={photoRequired && photos.length === 0}
              >
                Lưu mục này
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full font-medium text-[16px]"
                style={{ minHeight: 52 }}
              >
                Huỷ
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export type { ItemType }
