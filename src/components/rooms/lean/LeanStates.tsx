import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Shared UI states cho Room Check Lean.
 * Mục tiêu: text tiếng Việt nhất quán, không phụ thuộc lib lớn.
 */

export const LEAN_TEXT = {
  loadingRoom: 'Đang tải thông tin phòng...',
  loadingChecklist: 'Đang tải danh mục kiểm tra...',
  savingDraft: 'Đang lưu tạm...',
  uploadingPhoto: 'Đang gửi ảnh...',
  submitting: 'Đang gửi kết quả...',

  errRoomOpen: 'Không mở được thông tin phòng này. Bạn hãy thử lại.',
  errLastCheck: 'Chưa xem được lần kiểm trước. Bạn vẫn có thể tiếp tục kiểm tra.',
  errDraftSave: 'Chưa lưu tạm được. Thông tin bạn vừa nhập vẫn còn trên máy này.',
  errNetwork: 'Mạng đang yếu nên chưa gửi được kết quả. Bạn có thể thử lại hoặc lưu tạm.',
  errConflict: 'Phòng này vừa có người cập nhật. Bạn cần tải lại trước khi gửi kết quả.',

  emptyFirstCheck: 'Bạn sẽ là người kiểm đầu tiên cho phòng này.',
  emptyNoIssue: 'Chưa có vấn đề nào được ghi nhận.',
  emptyNoMinibar: 'Chưa có món minibar đã dùng.',
} as const

/* ─────────────── Loading text inline ─────────────── */
export function LeanLoadingText({
  text = LEAN_TEXT.loadingRoom,
  className,
}: {
  text?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-[16px] text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{text}</span>
    </div>
  )
}

/* ─────────────── Inline error block ─────────────── */
export function LeanInlineError({
  message,
  onRetry,
  retryLabel = 'Thử lại',
}: {
  message: string
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3"
    >
      <p className="text-[15px] text-destructive font-medium leading-snug">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-[14px] font-semibold text-destructive underline"
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}

/* ─────────────── Full screen error ─────────────── */
export function LeanFullScreenError({
  title,
  message,
  primaryLabel = 'Thử lại',
  onPrimary,
  secondaryLabel,
  onSecondary,
  primaryLoading,
}: {
  title: string
  message: string
  primaryLabel?: string
  onPrimary?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  primaryLoading?: boolean
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-background">
      <h1 className="text-[24px] font-semibold mb-2">{title}</h1>
      <p className="text-[18px] text-muted-foreground mb-8 max-w-sm">
        {message}
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {onPrimary && (
          <Button
            onClick={onPrimary}
            disabled={primaryLoading}
            className="text-[18px] font-semibold"
            style={{ minHeight: 56 }}
          >
            {primaryLoading && <Loader2 className="h-5 w-5 animate-spin mr-2" />}
            {primaryLabel}
          </Button>
        )}
        {onSecondary && secondaryLabel && (
          <Button
            variant="outline"
            onClick={onSecondary}
            className="text-[16px] font-medium"
            style={{ minHeight: 52 }}
          >
            {secondaryLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

/* ─────────────── Save status line ─────────────── */
export type SaveStatusKind = 'idle' | 'saving' | 'saved' | 'error'

export function LeanSaveStatusLine({
  status,
  savedAt,
  errorText = LEAN_TEXT.errDraftSave,
}: {
  status: SaveStatusKind
  savedAt?: number | null
  errorText?: string
}) {
  return (
    <div
      className={cn(
        'text-[13px]',
        status === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
      aria-live="polite"
    >
      {status === 'saving' && LEAN_TEXT.savingDraft}
      {status === 'saved' &&
        savedAt &&
        `Đã lưu lúc ${new Date(savedAt).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        })}`}
      {status === 'idle' && 'Chưa lưu'}
      {status === 'error' && errorText}
    </div>
  )
}

/* ─────────────── Upload status badge ─────────────── */
export function LeanUploadStatusBadge({
  state,
}: {
  state: 'idle' | 'uploading' | 'done' | 'error'
}) {
  if (state === 'idle') return null
  const map = {
    uploading: { text: 'Đang gửi ảnh...', cls: 'text-muted-foreground' },
    done: { text: 'Đã gửi ảnh', cls: 'text-green-600' },
    error: { text: 'Ảnh chưa gửi được', cls: 'text-destructive' },
  } as const
  const cur = map[state]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[12px] font-medium',
        cur.cls,
      )}
    >
      {state === 'uploading' && <Loader2 className="h-3 w-3 animate-spin" />}
      {cur.text}
    </span>
  )
}

/* ─────────────── Empty state inline ─────────────── */
export function LeanEmpty({ text }: { text: string }) {
  return (
    <p className="text-[14px] text-muted-foreground italic">{text}</p>
  )
}
