import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useUser } from '@/hooks/useUser'
import { useRoomCheckSession, getSessionDurationMinutes, formatSessionDuration } from '@/hooks/useRoomCheckSession'
import { cn } from '@/lib/utils'

interface Props {
  roomId: string
  /** Cho phép manager tiếp quản phiên của người khác */
  canTakeOver?: boolean
  /** Khi user nhấn "Bỏ phiên" */
  onDiscard?: () => void
  className?: string
}

/**
 * Banner cảnh báo phiên kiểm dở dang.
 * - Nếu phiên thuộc về user hiện tại: cho phép Tiếp tục/Bỏ.
 * - Nếu thuộc người khác: chỉ hiển thị thông tin (manager có thể tiếp quản nếu canTakeOver).
 */
export function DraftResumeBanner({ roomId, canTakeOver = false, onDiscard, className }: Props) {
  const navigate = useNavigate()
  const { user, tenantId } = useUser()
  const { session, isLoading, deleteSession, takeOverSession } = useRoomCheckSession(roomId)

  const minutes = useMemo(
    () => (session ? getSessionDurationMinutes(session.started_at) : 0),
    [session]
  )

  if (isLoading || !session) return null

  const isMine = session.user_id === user?.id
  const isStale = minutes > 60 // phiên cũ > 1h coi là stale

  const handleDiscard = async () => {
    await deleteSession(roomId)
    onDiscard?.()
  }

  const handleTakeOver = async () => {
    if (!user || !tenantId) return
    await takeOverSession(roomId, session.check_type, user.full_name || 'Quản lý', tenantId)
  }

  return (
    <div
      className={cn(
        'border-l-4 rounded-md p-3 space-y-2',
        isMine
          ? isStale
            ? 'border-amber-500 bg-amber-50/50'
            : 'border-blue-500 bg-blue-50/50'
          : 'border-muted-foreground/30 bg-muted/40',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm font-semibold',
            isMine ? (isStale ? 'text-amber-700' : 'text-blue-700') : 'text-foreground'
          )}>
            {isMine
              ? `Bạn đang kiểm dở phòng này`
              : `${session.user_name} đang kiểm phòng này`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Bắt đầu {formatSessionDuration(minutes)} trước · Loại: {labelForType(session.check_type)}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {isMine ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1 h-9"
              onClick={handleDiscard}
            >
              Bỏ phiên
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1 h-9"
              onClick={() => navigate(0)}
            >
              Tiếp tục
            </Button>
          </>
        ) : canTakeOver ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full h-9"
            onClick={handleTakeOver}
          >
            Tiếp quản phiên
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Chờ {session.user_name} hoàn tất hoặc liên hệ quản lý để tiếp quản.
          </p>
        )}
      </div>
    </div>
  )
}

function labelForType(t: string): string {
  switch (t) {
    case 'daily': return 'Hàng ngày'
    case 'checkin': return 'Check-in'
    case 'checkout': return 'Check-out'
    case 'maintenance': return 'Bảo trì'
    case 'delivery': return 'Sau giao hàng'
    case 'replenish': return 'Bổ sung'
    default: return t
  }
}
