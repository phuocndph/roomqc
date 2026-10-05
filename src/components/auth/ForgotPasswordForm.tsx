import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, ArrowLeft, CheckCircle, Loader2, RefreshCw, AlertCircle, UserPlus, Lock, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { forgotPasswordSchema, ForgotPasswordData, resetPasswordSchema, ResetPasswordData } from '@/lib/validations/auth.schemas'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'

type Step = 'email' | 'otp' | 'password' | 'success'

export function ForgotPasswordForm() {
  const { t } = useTranslation(['auth', 'common'])
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [tempToken, setTempToken] = useState('')
  const [isResending, setIsResending] = useState(false)
  const [emailNotFound, setEmailNotFound] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const { toast } = useToast()

  const emailForm = useForm<ForgotPasswordData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const passwordForm = useForm<ResetPasswordData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const sendOTP = async (emailAddress: string) => {
    const { data, error } = await supabase.functions.invoke('send-password-reset', {
      body: { email: emailAddress },
    })

    if (error) {
      throw new Error(t('common:messages.errorOccurred'))
    }

    if (data?.email_not_found) {
      const err = new Error(t('errors.emailNotFound')) as Error & { emailNotFound?: boolean }
      err.emailNotFound = true
      throw err
    }

    if (data?.success === false || data?.error) {
      throw new Error(data.error || t('common:messages.errorOccurred'))
    }

    return data
  }

  const verifyOTP = async (emailAddress: string, otpCode: string) => {
    const { data, error } = await supabase.functions.invoke('verify-otp', {
      body: { email: emailAddress, otp: otpCode },
    })

    if (error) {
      throw new Error(t('common:messages.errorOccurred'))
    }

    return data
  }

  const resetPassword = async (emailAddress: string, token: string, newPassword: string) => {
    const { data, error } = await supabase.functions.invoke('reset-password-with-otp', {
      body: { email: emailAddress, temp_token: token, new_password: newPassword },
    })

    if (error) {
      throw new Error(t('common:messages.errorOccurred'))
    }

    return data
  }

  const onSubmitEmail = async (data: ForgotPasswordData) => {
    try {
      setEmail(data.email)
      setEmailNotFound(false)
      await sendOTP(data.email)
      setStep('otp')
      setCountdown(60) // 60 seconds cooldown for resend
      toast({
        title: t('forgotPassword.otpSent'),
        description: t('forgotPassword.otpExpiry'),
      })
    } catch (error: any) {
      if (error.emailNotFound || error.message?.includes('chưa được đăng ký')) {
        setEmailNotFound(true)
      } else {
        toast({
          title: t('common:messages.error'),
          description: getFriendlyError(error) || t('common:messages.errorOccurred'),
          variant: 'destructive',
        })
      }
    }
  }

  const onOTPComplete = async (value: string) => {
    setOtp(value)
    if (value.length === 6) {
      try {
        setOtpError('')
        const result = await verifyOTP(email, value)
        
        if (result.success && result.temp_token) {
          setTempToken(result.temp_token)
          setStep('password')
          toast({
            title: t('forgotPassword.otpVerified'),
          })
        } else {
          setOtpError(result.error || t('forgotPassword.wrongOtp'))
          if (result.remaining_attempts !== undefined) {
            setRemainingAttempts(result.remaining_attempts)
          }
          if (result.code === 'OTP_EXPIRED' || result.code === 'TOO_MANY_ATTEMPTS') {
            setStep('email')
          }
        }
      } catch (error: any) {
        setOtpError(error.message || t('common:messages.errorOccurred'))
      }
    }
  }

  const onSubmitPassword = async (data: ResetPasswordData) => {
    try {
      const result = await resetPassword(email, tempToken, data.password)
      
      if (result.success) {
        setStep('success')
        toast({
          title: t('resetPassword.success'),
          description: t('resetPassword.successDescription'),
        })
      } else {
        toast({
          title: t('common:messages.error'),
          description: result.error || t('common:messages.errorOccurred'),
          variant: 'destructive',
        })
        if (result.code === 'TOKEN_EXPIRED' || result.code === 'INVALID_TOKEN') {
          setStep('email')
        }
      }
    } catch (error: any) {
      toast({
        title: t('common:messages.error'),
        description: getFriendlyError(error) || t('common:messages.errorOccurred'),
        variant: 'destructive',
      })
    }
  }

  const handleResendOTP = async () => {
    if (countdown > 0 || !email) return
    
    setIsResending(true)
    try {
      await sendOTP(email)
      setCountdown(60)
      setOtp('')
      setOtpError('')
      setRemainingAttempts(null)
      toast({
        title: t('forgotPassword.otpSent'),
        description: t('forgotPassword.otpExpiry'),
      })
    } catch (error: any) {
      toast({
        title: t('common:messages.error'),
        description: getFriendlyError(error) || t('common:messages.errorOccurred'),
        variant: 'destructive',
      })
    } finally {
      setIsResending(false)
    }
  }

  // Step 4: Success
  if (step === 'success') {
    return (
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <CardTitle>{t('resetPassword.success')}</CardTitle>
            <CardDescription>
              {t('resetPassword.successDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/auth/login">
                {t('forgotPassword.backToLogin')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Step 3: New Password
  if (step === 'password') {
    return (
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>{t('resetPassword.title')}</CardTitle>
            <CardDescription>
              {t('resetPassword.subtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onSubmitPassword)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('resetPassword.newPassword')}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            className="pl-10 pr-10"
                            autoComplete="new-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('resetPassword.confirmPassword')}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            className="pl-10 pr-10"
                            autoComplete="new-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={passwordForm.formState.isSubmitting}
                >
                  {passwordForm.formState.isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('common:messages.loading')}
                    </>
                  ) : (
                    t('resetPassword.resetButton')
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Step 2: OTP Input
  if (step === 'otp') {
    return (
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle>{t('forgotPassword.enterOtp')}</CardTitle>
            <CardDescription>
              {t('forgotPassword.otpSentTo')} <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={onOTPComplete}
                disabled={emailForm.formState.isSubmitting}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            {otpError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{otpError}</AlertDescription>
              </Alert>
            )}

            <p className="text-center text-sm text-muted-foreground">
              {t('forgotPassword.otpExpiry')}
            </p>

            <div className="space-y-2">
              <Button
                type="button"
                onClick={handleResendOTP}
                variant="outline"
                className="w-full"
                disabled={isResending || countdown > 0}
              >
                {isResending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common:messages.loading')}
                  </>
                ) : countdown > 0 ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('forgotPassword.resendIn')} {countdown}s
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('forgotPassword.resendOtp')}
                  </>
                )}
              </Button>
              
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep('email')
                  setOtp('')
                  setOtpError('')
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('forgotPassword.changeEmail')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Step 1: Email Input
  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>{t('forgotPassword.title')}</CardTitle>
          <CardDescription>
            {t('forgotPassword.subtitleOtp')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...emailForm}>
            <form onSubmit={emailForm.handleSubmit(onSubmitEmail)} className="space-y-4">
              <FormField
                control={emailForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('forgotPassword.email')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          {...field}
                          type="email"
                          placeholder="email@example.com"
                          className="pl-10"
                          autoComplete="email"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {emailNotFound && (
                <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t('errors.emailNotFound')}</AlertTitle>
                  <AlertDescription className="mt-2 space-y-3">
                    <p>{t('errors.emailNotFound')}</p>
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link to="/auth/register">
                        <UserPlus className="mr-2 h-4 w-4" />
                        {t('login.signUp')}
                      </Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={emailForm.formState.isSubmitting}
              >
                {emailForm.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common:messages.loading')}
                  </>
                ) : (
                  t('forgotPassword.sendOtp')
                )}
              </Button>
            </form>
          </Form>

          <Button asChild variant="ghost" className="mt-4 w-full">
            <Link to="/auth/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('forgotPassword.backToLogin')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
