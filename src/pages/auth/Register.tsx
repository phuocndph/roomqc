import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { runtimeConfig } from '@/lib/runtime-config'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'

const Register = () => {
  const { t } = useTranslation('auth')
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/auth/callback', { replace: true })
    }
  }, [isAuthenticated, navigate])

  if (runtimeConfig.workspace?.workspace.status === 'active') return <Navigate to="/auth/login" replace />

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4 relative">
      {/* Language Switcher - Top Right */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      
      <div className="w-full max-w-md space-y-3">
        {runtimeConfig.workspace?.workspace.reservationExpiresAt && <p className="rounded border border-blue-200 bg-white p-3 text-sm text-slate-700" role="note">
          Địa chỉ doanh nghiệp được giữ đến {new Date(runtimeConfig.workspace.workspace.reservationExpiresAt).toLocaleString('vi-VN')}.
          {' '}Hãy xác thực email và gửi thông tin khách sạn trước thời điểm này. Sau khi bắt đầu thiết lập, địa chỉ sẽ được giữ để bạn tiếp tục nếu có lỗi kết nối.
        </p>}
        <RegisterForm />
      </div>
    </div>
  )
}

export default Register
