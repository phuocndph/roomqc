import { useState } from 'react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Loader2, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  useUpdateRoomCheckItem,
  type IssueListKey,
  type IssueResolution,
  type RoomCheckItem,
} from '@/hooks/useBookingIssues'

interface IssueItemRowProps {
  roomCheckId: string
  listKey: IssueListKey
  itemIndex: number
  item: RoomCheckItem
  checkType: string
  checkedAt: string | null
  checkedByName: string | null
  photos: string[]
}

const checkTypeLabel: Record<string, string> = {
  daily: 'Hàng ngày',
  checkin: 'Check-in',
  checkout: 'Check-out',
  maintenance: 'Bảo trì',
  delivery: 'Giao đồ',
  replenish: 'Bổ sung',
  periodic: 'Định kỳ',
}

const formatVND = (v: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v)

export function IssueItemRow({
  roomCheckId,
  listKey,
  itemIndex,
  item,
  checkType,
  checkedAt,
  checkedByName,
  photos,
}: IssueItemRowProps) {
  const [reason, setReason] = useState(item.reason || '')
  const [resolution, setResolution] = useState<IssueResolution | undefined>(item.resolution)
  const [photoOpen, setPhotoOpen] = useState<string | null>(null)
  const updateMutation = useUpdateRoomCheckItem()

  const isLost = listKey === 'items_lost'
  const qty = item.quantity || 1
  const unitCost = item.damage_cost || 0
  const totalCost = unitCost * qty
  const isDirty = reason !== (item.reason || '') || resolution !== item.resolution

  const handleSaveReason = () => {
    updateMutation.mutate({
      roomCheckId,
      listKey,
      itemIndex,
      patch: { reason: reason.trim() || undefined },
    })
  }

  const handleResolutionChange = (next: IssueResolution) => {
    setResolution(next)
    updateMutation.mutate({
      roomCheckId,
      listKey,
      itemIndex,
      patch: { resolution: next },
    })
  }

  return (
    <div className="py-3 space-y-2">
      {/* Header: tên + badge */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{item.item_name || 'Vật dụng'}</span>
          <span className="text-xs text-muted-foreground">×{qty}</span>
          <Badge
            variant="outline"
            className={cn(
              'text-xs h-5',
              isLost ? 'text-destructive border-destructive/40' : 'text-orange-600 border-orange-500/40',
            )}
          >
            {isLost ? 'MẤT' : 'HỎNG'}
          </Badge>
          {!isLost && item.damage_type && (
            <Badge variant="outline" className="text-xs h-5 text-muted-foreground">
              {item.damage_type === 'replacement_needed' ? 'Cần thay mới' : 'Có thể sửa'}
            </Badge>
          )}
        </div>
        {totalCost > 0 && (
          <span className="text-sm font-mono font-semibold text-destructive">{formatVND(totalCost)}</span>
        )}
      </div>

      {/* Meta */}
      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
        <span>{checkedAt ? format(new Date(checkedAt), 'dd/MM HH:mm', { locale: vi }) : 'N/A'}</span>
        <span>•</span>
        <span>{checkTypeLabel[checkType] || checkType}</span>
        {checkedByName && (
          <>
            <span>•</span>
            <span>Người báo: {checkedByName}</span>
          </>
        )}
        {item.item_code && (
          <>
            <span>•</span>
            <span className="font-mono">{item.item_code}</span>
          </>
        )}
      </div>

      {/* Nguyên nhân */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Nguyên nhân</label>
        <div className="flex gap-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Mô tả nguyên nhân (vd: khách làm rơi, do hao mòn...)"
            className="min-h-[36px] text-sm py-1.5"
            rows={1}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            disabled={!isDirty || reason === (item.reason || '') || updateMutation.isPending}
            onClick={handleSaveReason}
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Quyết định xử lý */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Quyết định xử lý</label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: 'charge_guest', label: totalCost > 0 ? `Thu khách ${formatVND(totalCost)}` : 'Thu khách', cls: 'text-red-600 border-red-500/40' },
              { value: 'waive', label: 'Miễn / Bỏ qua', cls: 'text-muted-foreground' },
              { value: 'internal', label: 'Bảo hành / Nội bộ', cls: 'text-blue-600 border-blue-500/40' },
            ] as { value: IssueResolution; label: string; cls: string }[]
          ).map((opt) => {
            const active = resolution === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleResolutionChange(opt.value)}
                disabled={updateMutation.isPending}
                className={cn(
                  'h-7 px-2.5 rounded-md border text-xs transition-colors',
                  active
                    ? cn('font-medium', opt.cls)
                    : 'text-muted-foreground border-border hover:bg-muted',
                )}
              >
                {active ? '● ' : '○ '}
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Ảnh */}
      {photos && photos.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {photos.slice(0, 4).map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPhotoOpen(url)}
              className="h-12 w-12 rounded border overflow-hidden hover:opacity-80"
            >
              <img src={url} alt={`Ảnh ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
          {photos.length > 4 && (
            <span className="text-xs text-muted-foreground">+{photos.length - 4}</span>
          )}
        </div>
      )}

      <Dialog open={!!photoOpen} onOpenChange={(open) => !open && setPhotoOpen(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          {photoOpen && <img src={photoOpen} alt="Ảnh sự cố" className="w-full h-auto" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
