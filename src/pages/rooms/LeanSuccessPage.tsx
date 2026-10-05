import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRoom } from '@/hooks/useRooms'
import { useUndoQuickRoomCheck } from '@/hooks/useUndoQuickRoomCheck'

type LeanCheckType = 'daily' | 'periodic' | 'checkin' | 'checkout' | 'maintenance'

const CHECK_TYPE_LABEL: Record<string, string> = {
  daily: 'Kiểm hằng ngày',
  periodic: 'Kiểm định kỳ',
  checkin: 'Nhận phòng',
  checkout: 'Trả phòng',
  maintenance: 'Bảo trì',
}

/**
 * Success screen sau khi gửi room check Lean.
 * Quick path → cho phép Hoàn tác trong UNDO_WINDOW_MS.
 */
const UNDO_WINDOW_MS = 10_000

export default function LeanSuccessPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const checkType: LeanCheckType =
    (params.get('type') as LeanCheckType) || 'daily'
  const issueCount = Number(params.get('issues') || 0)
  const checkId = params.get('checkId') || ''
  const isQuick = params.get('quick') === '1'

  const { data: roomData } = useRoom(id)
  const room = roomData?.room

  const submittedAt = useMemo(() => new Date(), [])
  const [secondsLeft, setSecondsLeft] = useState(
    Math.floor(UNDO_WINDOW_MS / 1000),
  )

  // Countdown undo (chỉ quick path)
  useEffect(() => {
    if (!isQuick) return
    const t = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [isQuick])

  const showUndo = isQuick && secondsLeft > 0

  const message =
    issueCount === 0
      ? 'Phòng đã được xác nhận ổn.'
      : `${issueCount} vấn đề đã được ghi nhận.`

  return (
    <div className="min-h-screen flex flex-col items-center justify-between bg-background px-6 pt-12 pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md w-full">
        <CheckCircle2
          className="text-green-600 mb-4"
          style={{ width: 72, height: 72 }}
          aria-hidden
        />
        <h1
          className="font-bold leading-tight mb-2"
          style={{ fontSize: 24 }}
        >
          Đã gửi kết quả kiểm tra phòng.
        </h1>

        <p className="text-[18px] text-foreground font-medium mb-1">
          Phòng {room?.room_number || '—'}
          <span className="text-muted-foreground font-normal">
            {' · '}
            {CHECK_TYPE_LABEL[checkType] || checkType}
          </span>
        </p>
        <p className="text-[14px] text-muted-foreground mb-6">
          {submittedAt.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          ·{' '}
          {submittedAt.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
          })}
        </p>

        <div
          className={
            issueCount === 0
              ? 'rounded-xl border border-green-200 bg-green-50 px-4 py-3 w-full'
              : 'rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 w-full'
          }
        >
          <p
            className={
              issueCount === 0
                ? 'text-[16px] text-green-700 font-medium'
                : 'text-[16px] text-amber-700 font-medium'
            }
          >
            {message}
          </p>
        </div>

        {showUndo && checkId && (
          <UndoButton
            checkId={checkId}
            secondsLeft={secondsLeft}
            onDone={() => {
              navigate(`/rooms/${id}/check-lean?type=${checkType}`, {
                replace: true,
              })
            }}
          />
        )}
      </div>

      {/* CTA */}
      <div className="w-full max-w-md flex flex-col gap-2">
        <Button
          onClick={() => navigate('/my-tasks', { replace: true })}
          className="w-full text-[18px] font-semibold"
          style={{ minHeight: 56 }}
        >
          Quay về danh sách việc
        </Button>
        {checkId && (
          <Button
            variant="outline"
            onClick={() => navigate(`/rooms/${id}`)}
            className="w-full text-[16px] font-medium"
            style={{ minHeight: 52 }}
          >
            Xem kết quả vừa gửi
          </Button>
        )}
      </div>
    </div>
  )
}

function UndoButton({
  checkId,
  secondsLeft,
  onDone,
}: {
  checkId: string
  secondsLeft: number
  onDone: () => void
}) {
  const undo = useUndoQuickRoomCheck()
  return (
    <button
      type="button"
      disabled={undo.isPending}
      onClick={async () => {
        try {
          await undo.mutateAsync({ checkId, reason: 'undo from success screen' })
          onDone()
        } catch {
          /* error toast đã hiển thị trong hook */
        }
      }}
      className="mt-4 inline-flex items-center gap-2 text-[15px] font-semibold text-destructive underline disabled:opacity-60"
    >
      {undo.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
      Hoàn tác ({secondsLeft}s)
    </button>
  )
}
