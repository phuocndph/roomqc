import { useTranslation } from 'react-i18next'
import { ClipboardList, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RoomWithStats } from '@/types/rooms.types'

interface Props {
  room: RoomWithStats
  session: { user_id: string; user_name: string; check_type: string } | null | undefined
  currentUserId?: string
  canViewRoomDetail: boolean
  canCreateTask: boolean
  onCheck: () => void
  onDetail: () => void
  onCreateTask?: (room: RoomWithStats) => void
  onClose: () => void
}

export function QuickViewFooter({
  room, session, currentUserId, canViewRoomDetail, canCreateTask,
  onCheck, onDetail, onCreateTask, onClose,
}: Props) {
  const { t } = useTranslation(['rooms'])
  return (
    <div className="px-4 pb-4 pt-1 space-y-2">
      <Button
        className="w-full h-10"
        disabled={!!session && session.user_id !== currentUserId}
        onClick={onCheck}
      >
        {session
          ? session.user_id === currentUserId
            ? t('checkSession.continueCheck')
            : t('checkSession.inProgress')
          : 'Kiểm tra phòng'}
      </Button>
      <div className="flex gap-2">
        {canViewRoomDetail && (
          <Button variant="outline" className="flex-1 h-9" onClick={onDetail}>
            <ExternalLink className="h-4 w-4 mr-1.5" />
            Xem chi tiết phòng
          </Button>
        )}
        {canCreateTask && onCreateTask && (
          <Button
            variant="outline"
            className="h-9"
            onClick={() => { onCreateTask(room); onClose() }}
            title="Giao việc"
          >
            <ClipboardList className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
