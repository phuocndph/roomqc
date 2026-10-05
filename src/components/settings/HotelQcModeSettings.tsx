import { useHotelContext } from '@/contexts/HotelContext'
import { useHotelQcMode, useUpdateHotelQcMode, QC_MODE_LABELS, QC_MODE_DESC, type QcMode } from '@/hooks/useHotelQcMode'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/hooks/useUser'
import { isAdminUser } from '@/lib/userAccess'

/**
 * Card cấu hình chế độ QC (self / peer / strict) cho khách sạn đang chọn.
 * Chỉ admin / owner / manager được chỉnh.
 */
export function HotelQcModeSettings({ hotelId: forcedHotelId }: { hotelId?: string }) {
  const { selectedHotel } = useHotelContext()
  const hotelId = forcedHotelId ?? selectedHotel?.id ?? null
  const { user } = useUser()
  const canEdit = isAdminUser(user) || user?.user_level_code === 'manager'

  const { data: mode, isLoading } = useHotelQcMode(hotelId)
  const update = useUpdateHotelQcMode()

  if (!hotelId) {
    return (
      <div className="text-sm text-muted-foreground border rounded-lg p-4">
        Chọn một khách sạn để cấu hình chế độ kiểm soát chất lượng.
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Chế độ kiểm soát chất lượng (QC)</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Quy định ai được duyệt task housekeeping sau khi nhân viên báo hoàn thành.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <RadioGroup
          value={mode}
          onValueChange={(v) => canEdit && update.mutate({ hotelId, mode: v as QcMode })}
          disabled={!canEdit || update.isPending}
          className="space-y-2"
        >
          {(['self', 'peer', 'strict'] as QcMode[]).map((m) => (
            <label
              key={m}
              htmlFor={`qc-${m}`}
              className="flex items-start gap-3 border rounded-md p-3 cursor-pointer hover:bg-muted/40"
            >
              <RadioGroupItem id={`qc-${m}`} value={m} className="mt-0.5" />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{QC_MODE_LABELS[m]}</div>
                <div className="text-xs text-muted-foreground">{QC_MODE_DESC[m]}</div>
              </div>
            </label>
          ))}
        </RadioGroup>
      )}

      {!canEdit && (
        <p className="text-xs text-amber-600">Chỉ chủ khách sạn / quản lý mới được thay đổi chế độ này.</p>
      )}
    </div>
  )
}
