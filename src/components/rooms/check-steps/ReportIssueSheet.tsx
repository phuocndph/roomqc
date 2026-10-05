import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ItemType } from '@/types/items.types'
import { useImageUpload } from '@/hooks/useImageUpload'
import { useUser } from '@/hooks/useUser'
import { useHotelPhotoMode } from '@/hooks/useHotelPhotoMode'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'

export type IssueAction =
  | { type: 'laundry'; quantity: number; photos?: string[] }
  | { type: 'add'; quantity: number; photos?: string[] }
  | { type: 'change'; quantity: number; photos?: string[] }
  | { type: 'missing'; quantity: number; photos?: string[] }
  | { type: 'damaged'; quantity: number; notes?: string; photos?: string[] }
  | { type: 'lost'; quantity: number; notes?: string; photos?: string[] }
  | { type: 'consumed'; quantity: number; needRefill: boolean; photos?: string[] }
  | { type: 'empty'; quantity: number; needRefill: boolean; photos?: string[] }

export interface ReportIssueSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  itemType: ItemType
  standardQuantity: number
  availableStock?: number
  allowedActions: string[]
  onSubmit: (action: IssueAction) => void
}

const ISSUE_CATALOG: Record<string, { label: string; color: string }> = {
  laundry:  { label: 'Bẩn (cần giặt)', color: 'border-blue-500 text-blue-700' },
  change:   { label: 'Đã thay',         color: 'border-primary text-primary' },
  add:      { label: 'Đã thêm',         color: 'border-green-500 text-green-700' },
  missing:  { label: 'Thiếu',           color: 'border-amber-500 text-amber-700' },
  damaged:  { label: 'Hỏng',            color: 'border-amber-600 text-amber-700' },
  lost:     { label: 'Mất',             color: 'border-destructive text-destructive' },
  consumed: { label: 'Đã dùng',         color: 'border-cyan-500 text-cyan-700' },
  empty:    { label: 'Hết',             color: 'border-cyan-500 text-cyan-700' },
}

const ITEM_TYPE_ACTIONS: Record<ItemType, string[]> = {
  linen:      ['laundry', 'change', 'add', 'missing', 'damaged', 'lost'],
  consumable: ['consumed', 'empty', 'missing', 'lost'],
  equipment:  ['damaged', 'missing', 'lost'],
  furniture:  ['damaged', 'missing', 'lost'],
}
const PRIORITY = ['missing', 'damaged', 'laundry', 'empty', 'consumed', 'change', 'add', 'lost']

// Tình trạng cần ảnh bằng chứng khi hotel mode = on_issue
const PHOTO_REQUIRED_TYPES = new Set(['damaged', 'lost', 'missing'])

export function ReportIssueSheet({
  open,
  onOpenChange,
  itemName,
  itemType,
  standardQuantity,
  availableStock = 0,
  allowedActions,
  onSubmit,
}: ReportIssueSheetProps) {
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [needRefill, setNeedRefill] = useState(true)
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<string[]>([])

  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()
  const { data: photoMode = 'none' } = useHotelPhotoMode(selectedHotel?.id)
  const { uploadImage, isUploading } = useImageUpload()

  useEffect(() => {
    if (open) {
      setSelectedType(null)
      setQuantity(1)
      setNeedRefill(true)
      setNotes('')
      setPhotos([])
    }
  }, [open])

  const allowed = ITEM_TYPE_ACTIONS[itemType] || []
  const issueTypes = PRIORITY.filter(a => allowed.includes(a) && allowedActions.includes(a))

  // Logic enforcement ảnh
  const isPhotoRequired =
    photoMode === 'always' ||
    (photoMode === 'on_issue' && selectedType !== null && PHOTO_REQUIRED_TYPES.has(selectedType))

  const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !tenantId) return
    try {
      const uploaded = await uploadImage(file, tenantId)
      if (uploaded?.url) setPhotos(p => [...p, uploaded.url])
    } catch (err: any) {
      toast({ title: 'Tải ảnh thất bại', description: getFriendlyError(err), variant: 'destructive' })
    } finally {
      e.target.value = ''
    }
  }

  const handleConfirm = () => {
    if (!selectedType) return
    if (isPhotoRequired && photos.length === 0) {
      toast({
        title: 'Cần ít nhất 1 ảnh bằng chứng',
        description: 'Khách sạn yêu cầu chụp ảnh cho tình trạng này.',
        variant: 'destructive',
      })
      return
    }
    const qty = Math.max(1, Math.min(quantity, standardQuantity))
    const photoArr = photos.length > 0 ? photos : undefined

    switch (selectedType) {
      case 'laundry':  onSubmit({ type: 'laundry', quantity: qty, photos: photoArr }); break
      case 'change':   onSubmit({ type: 'change', quantity: qty, photos: photoArr }); break
      case 'add':      onSubmit({ type: 'add', quantity: qty, photos: photoArr }); break
      case 'missing':  onSubmit({ type: 'missing', quantity: qty, photos: photoArr }); break
      case 'damaged':  onSubmit({ type: 'damaged', quantity: qty, notes: notes || undefined, photos: photoArr }); break
      case 'lost':     onSubmit({ type: 'lost', quantity: qty, notes: notes || undefined, photos: photoArr }); break
      case 'consumed': onSubmit({ type: 'consumed', quantity: qty, needRefill, photos: photoArr }); break
      case 'empty':    onSubmit({ type: 'empty', quantity: qty, needRefill, photos: photoArr }); break
    }
    onOpenChange(false)
  }

  const isOutOfStock = availableStock === 0
  const isLowStock = availableStock > 0 && availableStock <= 5
  const showStockWarning = ['add', 'change', 'consumed', 'empty'].includes(selectedType || '')
  const showRefillSwitch = ['consumed', 'empty'].includes(selectedType || '')
  const showNotes = ['damaged', 'lost'].includes(selectedType || '')
  const isOverStandard = quantity > standardQuantity

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 max-h-[85vh] overflow-y-auto"
      >
        <div className="mx-auto w-10 h-1 bg-muted rounded-full mt-2 mb-3" />
        <SheetHeader className="px-4 pb-3 text-left">
          <SheetTitle className="text-base font-bold leading-tight">{itemName}</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Tiêu chuẩn: {standardQuantity} · Cập nhật tình trạng thực tế.
          </p>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-4">
          {/* Tình trạng */}
          <div>
            <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Tình trạng
            </Label>
            {issueTypes.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground italic">
                Không có tình trạng khả dụng cho loại đồ này.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {issueTypes.map(type => {
                  const cfg = ISSUE_CATALOG[type]
                  if (!cfg) return null
                  const isSelected = selectedType === type
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedType(type)}
                      className={cn(
                        'h-11 rounded-md border-2 font-semibold text-sm transition-colors active:bg-muted/50',
                        isSelected
                          ? cfg.color
                          : 'border-border bg-background text-foreground hover:bg-muted/40'
                      )}
                    >
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Số lượng */}
          {selectedType && (
            <div>
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Số lượng
              </Label>
              <div className="mt-2 flex items-center gap-3 border rounded-md p-2">
                <span className="flex-1 text-sm">Số lượng ảnh hưởng</span>
                <div className="flex items-center border rounded-md overflow-hidden">
                  <button
                    type="button"
                    className="h-9 w-9 text-lg font-semibold hover:bg-muted disabled:opacity-40"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                  >
                    −
                  </button>
                  <div className="w-14 text-center text-sm font-bold tabular-nums">
                    {quantity} / {standardQuantity}
                  </div>
                  <button
                    type="button"
                    className="h-9 w-9 text-lg font-semibold hover:bg-muted"
                    onClick={() => setQuantity(q => q + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
              {isOverStandard && (
                <p className="mt-1.5 text-[11px] text-amber-600 px-1">
                  Vượt tiêu chuẩn ({standardQuantity})
                </p>
              )}
            </div>
          )}

          {/* Tạo phiếu bổ sung */}
          {selectedType && showRefillSwitch && (
            <div className="flex items-center justify-between border rounded-md p-3">
              <Label className="text-sm font-medium">Tạo phiếu bổ sung từ kho</Label>
              <Switch checked={needRefill} onCheckedChange={setNeedRefill} />
            </div>
          )}

          {/* Cảnh báo kho */}
          {selectedType && showStockWarning && isOutOfStock && (needRefill || !showRefillSwitch) && (
            <p className="text-xs text-destructive px-1">
              Hết hàng trong kho. Cần nhập kho mới có thể bổ sung.
            </p>
          )}
          {selectedType && showStockWarning && isLowStock && (
            <p className="text-xs text-amber-600 px-1">
              Tồn kho thấp: chỉ còn {availableStock}.
            </p>
          )}

          {/* Ảnh bằng chứng */}
          {selectedType && (isPhotoRequired || photos.length > 0) && (
            <div>
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Ảnh bằng chứng {isPhotoRequired && <span className="text-destructive">* (bắt buộc)</span>}
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((url, i) => (
                  <div key={i} className="relative w-16 h-16">
                    <img src={url} alt="" className="w-16 h-16 object-cover rounded-md border" />
                    <button
                      type="button"
                      onClick={() => setPhotos(p => p.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <label className="w-16 h-16 border-2 border-dashed rounded-md flex items-center justify-center cursor-pointer hover:bg-muted text-xs font-semibold text-muted-foreground">
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : '+ Ảnh'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePickPhoto}
                    disabled={isUploading}
                  />
                </label>
              </div>
              {isPhotoRequired && photos.length === 0 && (
                <p className="mt-1.5 text-[11px] text-destructive px-1">
                  Khách sạn yêu cầu ít nhất 1 ảnh cho tình trạng này.
                </p>
              )}
            </div>
          )}

          {/* Ghi chú */}
          {selectedType && showNotes && (
            <div>
              <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Ghi chú (tùy chọn)
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={selectedType === 'damaged' ? 'Mô tả tình trạng hư hỏng...' : 'Lý do/hoàn cảnh...'}
                className="mt-2 h-20 text-sm resize-none"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              className="flex-1 h-11 font-semibold"
              disabled={!selectedType || (isPhotoRequired && photos.length === 0)}
              onClick={handleConfirm}
            >
              Lưu
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
