import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { useLastRoomCheck } from '@/hooks/useQuickRoomCheck'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

const TYPE_LABEL: Record<string, string> = {
  daily: 'Kiểm hằng ngày',
  checkin: 'Nhận phòng',
  checkout: 'Trả phòng',
  periodic: 'Kiểm định kỳ',
  maintenance: 'Bảo trì',
  delivery: 'Giao đồ',
  replenish: 'Bổ sung',
}

interface Props {
  roomId: string
}

/**
 * Context card - hiển thị lần kiểm gần nhất:
 * - Loại kiểm, người kiểm, thời gian
 * - Điểm sạch, sự cố
 * - 1 ảnh đại diện (nếu có)
 * Mục đích: nhân viên có ngữ cảnh trước khi bắt đầu phiên mới.
 */
export function LastCheckContextCard({ roomId }: Props) {
  const { data, isLoading } = useLastRoomCheck(roomId)

  if (isLoading) {
    return <Skeleton className="h-20 w-full rounded-lg" />
  }

  if (!data) {
    return (
      <div className="border border-dashed rounded-lg p-3 text-xs text-muted-foreground">
        Phòng này chưa có lần kiểm nào trước đây.
      </div>
    )
  }

  const hasIssues = (data.issues_count ?? 0) > 0 || data.items_complete === false
  const firstPhoto = data.photos?.[0]

  return (
    <div className="border rounded-lg p-3 bg-muted/20">
      <div className="flex items-start gap-3">
        {firstPhoto ? (
          <img
            src={firstPhoto}
            alt="Ảnh lần kiểm gần nhất"
            className="w-14 h-14 rounded-md object-cover flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
            Không ảnh
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold">
              {TYPE_LABEL[data.check_type] ?? data.check_type}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(data.checked_at), { addSuffix: true, locale: vi })}
            </span>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            Bởi {data.checker_name}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {data.cleanliness_score != null && (
              <Badge variant="outline" className="h-5 text-[10px] px-1.5">
                {data.cleanliness_score}/5
              </Badge>
            )}
            {hasIssues ? (
              <span className="text-[10px] text-red-600 font-medium">
                {data.issues_count} sự cố
              </span>
            ) : (
              <span className="text-[10px] text-green-600 font-medium">Không có sự cố</span>
            )}
          </div>
          {data.notes && (
            <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2 italic">
              "{data.notes}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
