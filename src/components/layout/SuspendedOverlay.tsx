import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SuspendedOverlay() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-md space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">
          {t('subscription.suspended_title', 'Tài khoản đã bị tạm ngưng')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('subscription.suspended_description', 'Vui lòng gia hạn gói đăng ký để tiếp tục sử dụng hệ thống.')}
        </p>
        <Button onClick={() => navigate('/settings/subscription')} className="mt-2">
          {t('subscription.renew_now', 'Gia hạn ngay')}
        </Button>
      </div>
    </div>
  )
}
