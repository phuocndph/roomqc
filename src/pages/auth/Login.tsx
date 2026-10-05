import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { LoginForm } from '@/components/auth/LoginForm'
import { QuickReLogin } from '@/components/auth/QuickReLogin'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { AutoLoginGate } from '@/components/auth/AutoLoginGate'

// Storage key for remember me functionality
const REMEMBERED_EMAIL_KEY = 'remembered_email';

const Login = () => {
  const { t } = useTranslation('auth')
  const { isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  
  // Check if there's a remembered email for quick re-login
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(null)
  const [showFullForm, setShowFullForm] = useState(false)

  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY)
    if (savedEmail) {
      setRememberedEmail(savedEmail)
    }
  }, [])

  useEffect(() => {
    // Chỉ redirect khi auth đã load xong và user đã authenticated
    if (!loading && isAuthenticated) {
      navigate('/auth/callback' + window.location.search, { replace: true })
    }
  }, [isAuthenticated, loading, navigate])

  // Show loading while auth is initializing
  if (loading) {
    return <LoadingSpinner fullScreen />
  }

  // If authenticated, don't render the form (will redirect)
  if (isAuthenticated) {
    return <LoadingSpinner fullScreen />
  }

  const handleSwitchAccount = () => {
    setShowFullForm(true)
  }

  const handleLoginSuccess = () => {
    navigate('/auth/callback' + window.location.search, { replace: true })
  }

  // Show quick re-login if there's a remembered email and user hasn't clicked "switch account"
  const showQuickLogin = rememberedEmail && !showFullForm

  return (
    <AutoLoginGate>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4 relative">
        {/* Language Switcher - Top Right */}
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>

        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              {showQuickLogin ? t('quickLogin.title', 'Đăng nhập nhanh') : t('login.title')}
            </CardTitle>
            <CardDescription className="text-center">
              {showQuickLogin 
                ? t('quickLogin.subtitle', 'Nhập mật khẩu để tiếp tục') 
                : t('login.subtitle')
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showQuickLogin ? (
              <QuickReLogin 
                email={rememberedEmail}
                onSwitchAccount={handleSwitchAccount}
                onSuccess={handleLoginSuccess}
              />
            ) : (
              <LoginForm />
            )}
          </CardContent>
        </Card>
      </div>
    </AutoLoginGate>
  )
}

export default Login
