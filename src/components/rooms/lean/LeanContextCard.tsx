import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { useLastRoomCheck } from '@/hooks/useQuickRoomCheck'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  roomId: string
  onSeeMore?: () => void
}

/**
 * Lean Context Card — chỉ hiển thị tối thiểu:
 * - Title "Lần kiểm gần nhất"
 * - "{timeAgo} · Ổn" hoặc "{timeAgo} · Có N điểm cần chú ý"
 * - 1 issue ngắn nếu có
 * - Link nhỏ "Xem thêm"
 *
 * Lỗi context: hiện thông báo nhẹ, KHÔNG chặn flow.
 */
export function LeanContextCard({ roomId, onSeeMore }: Props) {
  const { data, isLoading, isError } = useLastRoomCheck(roomId)

  if (isLoading) {
    return <Skeleton className="h-[88px] w-full rounded-lg" aria-label="Đang tải lần kiểm trước" />
  }

  if (isError) {
    return (
      <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 text-[16px] text-amber-900">
        Chưa xem được lần kiểm trước. Bạn vẫn có thể tiếp tục kiểm tra.
      </div>
    )
  }

  if (!data) {
    return (
      <div className="border border-dashed rounded-lg p-3 text-[16px] text-muted-foreground">
        Phòng này chưa có lần kiểm nào trước đây.
      </div>
    )
  }

  const issuesCount = data.issues_count ?? 0
  const hasIssues = issuesCount > 0 || data.items_complete === false
  const timeAgo = formatDistanceToNow(new Date(data.checked_at), {
    addSuffix: true,
    locale: vi,
  })

  return (
    <section
      aria-label="Lần kiểm gần nhất"
      className="border rounded-lg p-4 bg-muted/20 space-y-2"
    >
      <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
        Lần kiểm gần nhất
      </div>

      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[18px] text-foreground">{timeAgo}</span>
        <span aria-hidden className="text-muted-foreground">·</span>
        {hasIssues ? (
          <span className="text-[18px] font-semibold text-amber-700 inline-flex items-center gap-1">
            <span aria-hidden>⚠</span>
            <span>
              Có {issuesCount > 0 ? issuesCount : 1} điểm cần chú ý
            </span>
          </span>
        ) : (
          <span className="text-[18px] font-semibold text-green-700 inline-flex items-center gap-1">
            <span aria-hidden>✓</span>
            <span>Ổn</span>
          </span>
        )}
      </div>

      {hasIssues && data.notes && (
        <p className="text-[16px] text-foreground/80 line-clamp-2 italic">
          "{data.notes}"
        </p>
      )}

      {onSeeMore && (
        <button
          type="button"
          onClick={onSeeMore}
          className="text-[14px] text-primary underline-offset-4 hover:underline py-1"
        >
          Xem thêm
        </button>
      )}
    </section>
  )
}
