import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  isSubmitting: boolean
  errorMessage?: string | null
  onConfirm: () => void
  onBackToInspection: () => void
}

/**
 * Bottom sheet xác nhận Quick Path — cực ngắn, ít chữ, ít suy nghĩ.
 *
 * Lean rules:
 * - Title 24px, body 18px, helper 16px
 * - Primary 56px, secondary 52px, gap 12px
 * - 2 CTA xếp dọc — KHÔNG đối nghịch ngang
 * - State loading: nút primary đổi text "Đang gửi..."
 * - State error: hiện message thân thiện trên cùng helper
 */
export function QuickPathConfirmSheet({
  open,
  onOpenChange,
  isSubmitting,
  errorMessage,
  onConfirm,
  onBackToInspection,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-5 pt-6 pb-8"
        onPointerDownOutside={(e) => isSubmitting && e.preventDefault()}
      >
        <SheetHeader className="text-left space-y-2">
          <SheetTitle className="text-[24px] leading-tight font-semibold">
            Xác nhận phòng ổn
          </SheetTitle>
          <SheetDescription className="text-[18px] text-foreground/90">
            Không có vấn đề cần báo. Bạn có thể gửi nhanh kết quả.
          </SheetDescription>
        </SheetHeader>

        {errorMessage ? (
          <div
            role="alert"
            className="mt-4 border border-destructive/40 bg-destructive/5 rounded-md p-3 text-[16px] text-destructive flex items-start gap-2"
          >
            <span aria-hidden className="font-bold">!</span>
            <span>{errorMessage}</span>
          </div>
        ) : (
          <p className="mt-4 text-[16px] text-muted-foreground">
            Bạn vẫn có thể hoàn tác ngay sau khi gửi.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="w-full h-14 text-[18px] font-semibold"
            style={{ minHeight: 56 }}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Đang gửi...
              </>
            ) : (
              'Gửi nhanh'
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onBackToInspection}
            disabled={isSubmitting}
            className="w-full text-[16px] font-medium"
            style={{ minHeight: 52 }}
          >
            Quay lại kiểm tra kỹ
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
