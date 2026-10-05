import { useHotelContext } from '@/contexts/HotelContext'
import {
  useHotelPhotoMode,
  useUpdateHotelPhotoMode,
  PHOTO_MODE_LABELS,
  PHOTO_MODE_DESC,
  type PhotoEvidenceMode,
} from '@/hooks/useHotelPhotoMode'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/hooks/useUser'
import { isAdminUser } from '@/lib/userAccess'

/**
 * Cấu hình mức độ bắt buộc chụp ảnh khi nhân viên kiểm phòng.
 * Áp dụng cho cả luồng đầy đủ và Quick path "Phòng OK hoàn toàn".
 */
export function HotelPhotoEvidenceSettings({ hotelId: forcedHotelId }: { hotelId?: string }) {
  const { selectedHotel } = useHotelContext()
  const hotelId = forcedHotelId ?? selectedHotel?.id ?? null
  const { user } = useUser()
  const canEdit = isAdminUser(user) || user?.user_level_code === 'manager'

  const { data: mode, isLoading } = useHotelPhotoMode(hotelId)
  const update = useUpdateHotelPhotoMode()

  if (!hotelId) {
    return (
      <div className="text-sm text-muted-foreground border rounded-lg p-4">
        Chọn một khách sạn để cấu hình yêu cầu ảnh bằng chứng.
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Yêu cầu ảnh bằng chứng khi kiểm phòng</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Quy định khi nào nhân viên buồng phòng phải chụp ảnh trong lúc kiểm tra.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <RadioGroup
          value={mode}
          onValueChange={(v) => canEdit && update.mutate({ hotelId, mode: v as PhotoEvidenceMode })}
          disabled={!canEdit || update.isPending}
          className="space-y-2"
        >
          {(['none', 'on_issue', 'always'] as PhotoEvidenceMode[]).map((m) => (
            <label
              key={m}
              htmlFor={`photo-${m}`}
              className="flex items-start gap-3 border rounded-md p-3 cursor-pointer hover:bg-muted/40"
            >
              <RadioGroupItem id={`photo-${m}`} value={m} className="mt-0.5" />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{PHOTO_MODE_LABELS[m]}</div>
                <div className="text-xs text-muted-foreground">{PHOTO_MODE_DESC[m]}</div>
              </div>
            </label>
          ))}
        </RadioGroup>
      )}

      {!canEdit && (
        <p className="text-xs text-amber-600">Chỉ chủ khách sạn / quản lý mới được thay đổi.</p>
      )}
    </div>
  )
}
