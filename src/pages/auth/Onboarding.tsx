import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { Progress } from '@/components/ui/progress'

const onboardingSchema = z.object({
  tenantName: z.string().min(2, 'Tên công ty phải có ít nhất 2 ký tự'),
  tenantPhone: z.string().min(10, 'Số điện thoại không hợp lệ'),
  hotelName: z.string().min(2, 'Tên khách sạn phải có ít nhất 2 ký tự'),
  hotelAddress: z.string().min(5, 'Địa chỉ phải có ít nhất 5 ký tự'),
  hotelPhone: z.string().min(10, 'Số điện thoại không hợp lệ'),
  hotelEmail: z.string().email('Email không hợp lệ'),
  totalRooms: z.coerce.number().min(1, 'Số phòng phải lớn hơn 0').max(10000, 'Số phòng quá lớn'),
})

type OnboardingFormData = z.infer<typeof onboardingSchema>

export default function Onboarding() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { refetch: refetchUser } = useUser()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingMessage, setLoadingMessage] = useState('')
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
    if (!user?.id) {
      setError('Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setLoadingProgress(0)
    setLoadingMessage('Đang khởi tạo...')

    try {
      // Progress simulation
      setLoadingProgress(20)
      setLoadingMessage('Đang tạo công ty...')

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

      setLoadingProgress(60)
      setLoadingMessage('Đang cấu hình khách sạn...')

      if (error) {
        throw new Error(`Lỗi kết nối: ${error.message}`)
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

      setLoadingProgress(80)
      setLoadingMessage('Đang thiết lập danh mục và phân quyền...')

      // Success! Show success message
      setLoadingProgress(100)
      setLoadingMessage('Hoàn tất thiết lập!')

      toast({
        title: '🎉 Chào mừng bạn!',
        description: 'Tài khoản và khách sạn của bạn đã sẵn sàng. Đang chuyển hướng...',
      })

      // Refetch user data to update context
      await refetchUser()

      // Small delay then force full page reload to ensure all contexts are updated
      setTimeout(() => {
        window.location.href = '/'
      }, 800)
      
    } catch (error: any) {
      console.error('Onboarding error:', error)
      
      // Extract user-friendly error message
      let errorMessage = 'Có lỗi xảy ra khi thiết lập tài khoản'
      
      if (error.message) {
        if (error.message.includes('Basic subscription plan not found')) {
          errorMessage = 'Hệ thống chưa được cấu hình gói dịch vụ. Vui lòng liên hệ quản trị viên.'
        } else if (error.message.includes('violates check constraint')) {
          errorMessage = 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại thông tin.'
        } else if (error.message.includes('duplicate key')) {
          errorMessage = 'Tài khoản hoặc khách sạn đã tồn tại trong hệ thống.'
        } else {
          errorMessage = error.message
        }
      }
      
      setError(errorMessage)
      setLoadingProgress(0)
      setLoadingMessage('')
      
      toast({
        title: 'Lỗi thiết lập',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
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

          {isSubmitting && (
            <div className="mb-6 space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{loadingMessage}</span>
                <span>{loadingProgress}%</span>
              </div>
              <Progress value={loadingProgress} className="h-2" />
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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

              <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{loadingMessage || 'Đang xử lý...'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    <span>Hoàn tất thiết lập</span>
                  </div>
                )}
              </Button>
              
              {!isSubmitting && (
                <p className="text-xs text-center text-muted-foreground mt-4">
                  Bằng việc tiếp tục, bạn đồng ý với các điều khoản sử dụng và chính sách bảo mật của chúng tôi.
                </p>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
