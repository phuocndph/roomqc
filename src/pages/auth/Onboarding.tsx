import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/hooks/useUser'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Building2, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getRegistrationErrorMessage } from '@/lib/registration-error-messages'
import { getAccountSetupState } from '@/lib/account-setup'
import { AccountSetupNotice } from '@/components/auth/AccountSetupNotice'

const onboardingSchema = z.object({
  tenantName: z.string().trim().min(2, 'Tên công ty phải có ít nhất 2 ký tự'),
  tenantPhone: z.string().trim().min(10, 'Số điện thoại không hợp lệ'),
  hotelName: z.string().trim().min(2, 'Tên khách sạn phải có ít nhất 2 ký tự'),
  hotelAddress: z.string().trim().min(5, 'Địa chỉ phải có ít nhất 5 ký tự'),
  hotelPhone: z.string().trim().min(10, 'Số điện thoại không hợp lệ'),
  hotelEmail: z.string().trim().email('Email không hợp lệ'),
  totalRooms: z.coerce.number().int('Số phòng phải là số nguyên').min(1, 'Số phòng phải lớn hơn 0').max(10000, 'Số phòng quá lớn'),
})

type OnboardingFormData = z.infer<typeof onboardingSchema>

export default function Onboarding() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { user: profile, isLoading: profileLoading, error: profileError, refetch: refetchUser } = useUser()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const submissionInFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      tenantName: '',
      tenantPhone: '',
      hotelName: '',
      hotelAddress: '',
      hotelPhone: '',
      hotelEmail: user?.email || '',
      totalRooms: 10,
    },
  })

  const onSubmit = async (data: OnboardingFormData) => {
    if (submissionInFlight.current) return
    if (!user?.id) {
      setError('Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại.')
      return
    }

    submissionInFlight.current = true
    setIsSubmitting(true)
    setError(null)

    try {
      // Call complete_registration function
      const { data: result, error } = await supabase.rpc('complete_registration', {
        p_user_id: user.id,
        p_full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        p_email: user.email || '',
        p_phone: data.tenantPhone,
        p_tenant_name: data.tenantName,
        p_hotel_name: data.hotelName,
        p_hotel_address: data.hotelAddress,
        p_hotel_phone: data.hotelPhone,
        p_hotel_email: data.hotelEmail,
        p_total_rooms: data.totalRooms,
      })

      if (error) {
        throw error
      }

      // Handle result structure from function
      const resultData = result as { success?: boolean; error?: string; detail?: string; tenant_id?: string; hotel_id?: string } | null
      
      if (!resultData) {
        throw new Error('Không nhận được phản hồi từ máy chủ')
      }

      if (!resultData.success) {
        const errorMsg = resultData.error || 'Đăng ký thất bại'
        const errorDetail = resultData.detail ? ` (Mã lỗi: ${resultData.detail})` : ''
        throw new Error(`${errorMsg}${errorDetail}`)
      }

      if (!resultData.tenant_id || !resultData.hotel_id) {
        throw new Error('Registration returned an incomplete setup')
      }

      setCompleted(true)

      toast({
        title: '🎉 Chào mừng bạn!',
        description: 'Tài khoản và khách sạn của bạn đã sẵn sàng. Đang chuyển hướng...',
      })

      // Refresh the profile before resolving the first permitted route. The
      // callback presents a retry screen if this read fails after provisioning.
      await refetchUser()
      navigate('/auth/callback', { replace: true })
      
    } catch (error: unknown) {
      console.error('Onboarding error:', error)
      const errorMessage = getRegistrationErrorMessage(error)
      
      setError(errorMessage)
      setCompleted(false)
      submissionInFlight.current = false
      
      toast({
        title: 'Lỗi thiết lập',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (profileLoading) return <LoadingSpinner fullScreen />
  if (profileError) return <AccountSetupNotice onRetry={() => { void refetchUser() }} />
  const setupState = getAccountSetupState(profile)
  if (setupState === 'assignment-required') {
    return <AccountSetupNotice assignmentRequired onRetry={() => { void refetchUser() }} />
  }
  if (setupState === 'ready' && !isSubmitting && !completed) {
    return <Navigate to="/auth/callback" replace />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-8 w-8 text-primary" />
            <CardTitle className="text-2xl font-bold">Thiết lập khách sạn</CardTitle>
          </div>
          <CardDescription>
            Hoàn tất thông tin để bắt đầu sử dụng hệ thống quản lý
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {(isSubmitting || completed) && (
            <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{completed ? 'Khách sạn đã sẵn sàng. Đang mở trang chính…' : 'Đang thiết lập khách sạn và quyền truy cập…'}</span>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <fieldset disabled={isSubmitting || completed} className="space-y-6">
              {/* Tenant Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  Thông tin công ty
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="tenantName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tên công ty *</FormLabel>
                        <FormControl>
                          <Input placeholder="VD: Công ty TNHH ABC" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tenantPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Số điện thoại *</FormLabel>
                        <FormControl>
                          <Input placeholder="0901234567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Hotel Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  Thông tin khách sạn
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="hotelName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tên khách sạn *</FormLabel>
                        <FormControl>
                          <Input placeholder="VD: Khách sạn Sunrise" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="totalRooms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tổng số phòng *</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="hotelAddress"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Địa chỉ *</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Nguyễn Huệ, Q1, TP.HCM" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="hotelPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Số điện thoại *</FormLabel>
                        <FormControl>
                          <Input placeholder="0282345678" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="hotelEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="info@hotel.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || completed}>
                {isSubmitting || completed ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{completed ? 'Đang mở khách sạn…' : 'Đang xử lý…'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    <span>Hoàn tất thiết lập</span>
                  </div>
                )}
              </Button>
              
              {!isSubmitting && !completed && (
                <p className="text-xs text-center text-muted-foreground mt-4">
                  Bằng việc tiếp tục, bạn đồng ý với các điều khoản sử dụng và chính sách bảo mật của chúng tôi.
                </p>
              )}
              </fieldset>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
