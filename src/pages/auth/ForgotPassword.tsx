import { useTranslation } from 'react-i18next'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'

export default function ForgotPassword() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4 relative">
      {/* Language Switcher - Top Right */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      
      <ForgotPasswordForm />
    </div>
  )
}
