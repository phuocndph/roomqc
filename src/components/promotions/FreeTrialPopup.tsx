import { useState, useEffect } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useUser } from '@/hooks/useUser'
import { useTenantSubscription } from '@/hooks/useSubscription'
import { useActiveAnnouncements } from '@/hooks/announcements/useActiveAnnouncements'
import { isTenantOwner } from '@/lib/userAccess'
import { Gift, Phone, Mail, Calendar, CheckCircle2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

const STORAGE_KEY = 'free_trial_popup_dismissed'

export const FreeTrialPopup = () => {
  const [open, setOpen] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const { user } = useUser()
  const { data: subscription } = useTenantSubscription()
  // Nếu Super Admin đã cấu hình popup_center từ DB thì ẩn fallback hardcode này
  const { data: activeAnnouncements } = useActiveAnnouncements('popup_center')
  const hasDbPromo = (activeAnnouncements ?? []).some((a) => a.kind === 'promo_popup')

  useEffect(() => {
    if (!user || !subscription) return
    if (hasDbPromo) return

    const isEligibleRole = isTenantOwner(user)
    const isTrial = subscription.subscription_status === 'trial'
    const dismissed = localStorage.getItem(STORAGE_KEY)

    if (isEligibleRole && isTrial && !dismissed) {
      const timer = setTimeout(() => setOpen(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [user, subscription, hasDbPromo])

  const handleDismiss = () => {
    if (dontShowAgain) {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    setOpen(false)
  }

  const endDate = subscription?.subscription_end_date
  const formattedEndDate = endDate
    ? new Date(endDate).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : ''

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && handleDismiss()}>
      <AlertDialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto p-5 sm:p-6">
        <AlertDialogHeader className="space-y-3">
          <div className="flex items-center justify-center">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Gift className="h-7 w-7 text-primary" />
            </div>
          </div>
          <AlertDialogTitle className="text-center text-lg sm:text-xl leading-tight">
            Chương trình hỗ trợ chuyển đổi số
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-sm text-muted-foreground">
            Chúc mừng bạn đã đăng ký thành công! Bạn đang được hưởng chương trình ưu đãi đặc biệt:
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Body — tách khỏi Description để tránh ép style nested */}
        <div className="space-y-4">
          <div className="space-y-3 bg-muted/50 rounded-lg p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-foreground leading-snug">Miễn phí sử dụng 5 tháng</p>
                <p className="text-muted-foreground text-xs mt-0.5 leading-snug">
                  Toàn bộ tính năng phần mềm quản lý khách sạn
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-foreground leading-snug">Miễn phí setup & cài đặt</p>
                <p className="text-muted-foreground text-xs mt-0.5 leading-snug">
                  Hỗ trợ cài đặt, cấu hình phần mềm hoàn toàn miễn phí
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-foreground leading-snug">
                  Thời hạn dùng thử đến: {formattedEndDate}
                </p>
                <p className="text-muted-foreground text-xs mt-0.5 leading-snug">
                  Sau thời gian này, hệ thống sẽ bắt đầu tính phí theo gói sử dụng
                </p>
              </div>
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Liên hệ hỗ trợ:</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span>0828686866</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="break-all">roomqc@gmail.com</span>
            </div>
          </div>
        </div>

        {/* Footer — stack dọc đơn giản, không dùng AlertDialogFooter để tránh flex-col-reverse */}
        <div className="flex flex-col gap-3 mt-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="dont-show"
              checked={dontShowAgain}
              onCheckedChange={(v) => setDontShowAgain(v === true)}
            />
            <label htmlFor="dont-show" className="text-xs text-muted-foreground cursor-pointer leading-none">
              Không hiển thị lại
            </label>
          </div>
          <AlertDialogAction onClick={handleDismiss} className="w-full">
            Đã hiểu, bắt đầu sử dụng
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
