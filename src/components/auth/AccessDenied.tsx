import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldX, ArrowLeft, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { navigateBack } from '@/lib/navigation'

interface AccessDeniedProps {
  module?: string
  action?: string
  requiredRoles?: string[]
}

export function AccessDenied({ module, action, requiredRoles }: AccessDeniedProps) {
  const navigate = useNavigate()
  const { t } = useTranslation('common')

  const handleBack = () => {
    navigateBack(navigate, '/')
  }

  useEffect(() => {
    // Show toast once when component mounts
    toast.error(t('accessDenied.toast', 'Bạn không có quyền truy cập chức năng này'), {
      description: t('accessDenied.toastDescription', 'Liên hệ quản lý để được cấp quyền'),
      duration: 3000,
    })
  }, [t])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <ShieldX className="h-12 w-12 text-muted-foreground" />
      </div>
      
      <h2 className="text-xl font-semibold mb-2">
        {t('accessDenied.title', 'Không có quyền truy cập')}
      </h2>
      
      <p className="text-muted-foreground mb-6 max-w-md">
        {t('accessDenied.description', 'Bạn không có quyền xem chức năng này. Vui lòng liên hệ quản lý để được cấp quyền.')}
      </p>
      
      <div className="flex gap-3">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('accessDenied.goBack', 'Quay lại')}
        </Button>
        <Button onClick={() => navigate('/')}>
          <Home className="mr-2 h-4 w-4" />
          {t('accessDenied.goHome', 'Trang chủ')}
        </Button>
      </div>
    </div>
  )
}
