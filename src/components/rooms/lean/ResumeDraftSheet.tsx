import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'

export interface DraftPayload {
  data: any
  step: number
  quickMode?: boolean
  timestamp: number
}

interface Props {
  roomId: string
  roomName: string
  /** Callback khi user chọn "Tiếp tục" — trả lại payload đã parse */
  onResume: (draft: DraftPayload) => void
  /** Callback khi user chọn "Làm lại" — đã xoá draft */
  onDiscard: () => void
  /** Optional: link xem lại thông tin phòng */
  onViewRoomInfo?: () => void
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h

/**
 * Bottom sheet hiện khi phát hiện draft localStorage cho phòng này.
 * KHÔNG tự restore — bắt buộc user chọn.
 *
 * Lean rules:
 * - Title: "Bạn đang làm dở phòng {name}"
 * - Subtitle: "Đã lưu lúc {time}"
 * - 2 CTA xếp dọc, full width, primary 56px / secondary 52px
 * - 1 link nhỏ "Xem lại thông tin phòng"
 * - Không icon-only
 */
export function ResumeDraftSheet({
  roomId,
  roomName,
  onResume,
  onDiscard,
  onViewRoomInfo,
}: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DraftPayload | null>(null)

  useEffect(() => {
    if (!roomId) return
    try {
      const raw = localStorage.getItem(`room-check-${roomId}`)
      if (!raw) return
      const parsed = JSON.parse(raw) as DraftPayload
      if (!parsed?.timestamp) return
      // TTL 24h
      if (Date.now() - parsed.timestamp > MAX_AGE_MS) {
        localStorage.removeItem(`room-check-${roomId}`)
        return
      }
      setDraft(parsed)
      setOpen(true)
    } catch {
      // Corrupt draft → xoá
      localStorage.removeItem(`room-check-${roomId}`)
    }
  }, [roomId])

  const handleResume = () => {
    if (!draft) return
    setOpen(false)
    onResume(draft)
  }

  const handleDiscard = () => {
    try {
      localStorage.removeItem(`room-check-${roomId}`)
    } catch { /* draft cleanup is best effort */ }
    setOpen(false)
    setDraft(null)
    onDiscard()
  }

  if (!draft) return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-5 pt-6 pb-8 max-h-[80vh]"
        // Không cho đóng bằng tap outside để bắt user chọn
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <SheetHeader className="text-left space-y-2">
          <SheetTitle className="text-[24px] leading-tight font-semibold">
            Bạn đang làm dở phòng {roomName}
          </SheetTitle>
          <SheetDescription className="text-[16px] text-muted-foreground">
            Đã lưu lúc{' '}
            {formatDistanceToNow(new Date(draft.timestamp), { addSuffix: true, locale: vi })}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-3">
          <Button
            type="button"
            onClick={handleResume}
            className="w-full h-14 text-[18px] font-semibold"
            style={{ minHeight: 56 }}
          >
            Tiếp tục làm dở
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDiscard}
            className="w-full text-[16px] font-medium"
            style={{ minHeight: 52 }}
          >
            Làm lại từ đầu
          </Button>

          {onViewRoomInfo && (
            <button
              type="button"
              onClick={onViewRoomInfo}
              className="text-center text-[14px] text-primary underline-offset-4 hover:underline mt-1 py-2"
            >
              Xem lại thông tin phòng
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
