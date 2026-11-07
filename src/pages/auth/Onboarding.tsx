import { useEffect, useRef, useState } from 'react'
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
import { controlRequest, workspacePath } from '@/lib/workspace'
import { runtimeConfig } from '@/lib/runtime-config'
import { useMyStaffInvitation } from '@/hooks/useMyStaffInvitation'
import { ResumeStaffInvitation } from '@/components/auth/ResumeStaffInvitation'
import { useWorkspaceSetupStatus } from '@/hooks/useWorkspaceSetupStatus'

const onboardingSchema = z.object({
  tenantName: z.string().trim().refine(value => !value || value.length >= 2, 'Tên công ty phải có ít nhất 2 ký tự'),
  tenantPhone: z.string().trim().min(10, 'Số điện thoại không hợp lệ'),
  hotelName: z.string().trim().min(2, 'Tên khách sạn phải có ít nhất 2 ký tự'),
  hotelAddress: z.string().trim().min(5, 'Địa chỉ phải có ít nhất 5 ký tự'),
  hotelPhone: z.string().trim().refine(value => !value || value.length >= 10, 'Số điện thoại không hợp lệ'),
  hotelEmail: z.string().trim().pipe(z.union([z.string().email('Email không hợp lệ'), z.literal('')])),
  totalRooms: z.coerce.number().int('Số phòng phải là số nguyên').min(1, 'Số phòng phải lớn hơn 0').max(10000, 'Số phòng quá lớn'),
})

type OnboardingFormData = z.infer<typeof onboardingSchema>

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, session } = useAuth()
  const { user: profile, isLoading: profileLoading, error: profileError, refetch: refetchUser } = useUser()
  const invitation = useMyStaffInvitation(!profileLoading && (!profile || !!profileError))
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const submissionInFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const identity=JSON.stringify([user?.id,session?.access_token,runtimeConfig.workspace?.workspace.id,
    runtimeConfig.workspace?.workspace.routingVersion,runtimeConfig.workspace?.cluster.id,runtimeConfig.workspace?.cluster.url])
  const currentIdentity=useRef(identity);currentIdentity.current=identity
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  const directorySetup=!!runtimeConfig.workspace&&!profileLoading&&!profileError&&!invitation.isLoading&&!invitation.isError
    &&!invitation.data&&getAccountSetupState(profile)==='register'
  const setup=useWorkspaceSetupStatus(directorySetup,user?.id,session?.access_token)
  const canSetup=!runtimeConfig.workspace||directorySetup&&!setup.isLoading&&setup.data?.nextAction==='continue_setup'

  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      tenantName: '',
      tenantPhone: '',
      hotelName: runtimeConfig.workspace?.workspace.displayName || '',
      hotelAddress: '',
      hotelPhone: '',
      hotelEmail: '',
      totalRooms: 10,
    },
  })

  const onSubmit = async (data: OnboardingFormData) => {
    if (submissionInFlight.current || !canSetup) return
    if (!user?.id) {
      setError('Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại.')
      return
    }

    submissionInFlight.current = true
    setIsSubmitting(true)
    setError(null)
    const workspace = runtimeConfig.workspace
    const captured={id:workspace?.workspace.id,slug:workspace?.workspace.slug,version:workspace?.workspace.routingVersion,
      cluster:workspace?.cluster.id,url:workspace?.cluster.url,token:session?.access_token}
    const current=()=>mounted.current&&currentIdentity.current===identity
      &&runtimeConfig.workspace?.workspace.id===captured.id&&runtimeConfig.workspace?.workspace.routingVersion===captured.version
      &&runtimeConfig.workspace?.cluster.id===captured.cluster&&runtimeConfig.workspace?.cluster.url===captured.url
      &&runtimeConfig.workspace?.workspace.slug===captured.slug

    try {
      // Reuse the main contact unless the owner explicitly supplies alternatives.
      const tenantName = data.tenantName || data.hotelName
      const hotelPhone = data.hotelPhone || data.tenantPhone
      const hotelEmail = data.hotelEmail || user.email || ''
      // Call complete_registration function
      const response = workspace ? await (async () => {
        const status=await setup.refresh()
        if(!current())return {data:null,error:null}
        if(status?.nextAction!=='continue_setup')throw new Error('setup_status_required')
        const { data: { session } } = await supabase.auth.getSession()
        if(!current())return {data:null,error:null}
        if (!session || session.user?.id!==user.id || session.access_token!==captured.token) {
          throw new Error('Vui lòng đăng nhập lại để tiếp tục thiết lập.')
        }
        const result = await controlRequest(`/workspaces/${workspace.workspace.slug}/provision`, {
          method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({fullName:user.user_metadata?.full_name || user.email?.split('@')[0],
            phone:data.tenantPhone,tenantName,hotelName:data.hotelName,
            hotelAddress:data.hotelAddress,hotelPhone,hotelEmail,totalRooms:data.totalRooms}),
        })
        return {data:result,error:null}
      })() : await supabase.rpc('complete_registration', {
        p_user_id: user.id,
        p_full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        p_email: user.email || '',
        p_phone: data.tenantPhone,
        p_tenant_name: tenantName,
        p_hotel_name: data.hotelName,
        p_hotel_address: data.hotelAddress,
        p_hotel_phone: hotelPhone,
        p_hotel_email: hotelEmail,
        p_total_rooms: data.totalRooms,
      })
      if(!current())return
      const { data: result, error } = response

      if (error) {
        throw error
      }

      // Handle result structure from function
      const resultData = result as { success?: boolean; pending?: boolean; error?: string; detail?: string; tenant_id?: string; hotel_id?: string } | null
      
      if (!resultData) {
        throw new Error('Không nhận được phản hồi từ máy chủ')
      }

      if(workspace&&resultData.success===false&&resultData.pending===true){
        await setup.refresh()
        return
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

      if (workspace) {
        // Bootstrap the committed directory mapping before any profile query.
        window.location.assign(workspacePath('/auth/callback'))
        return
      }

      toast({
        title: '🎉 Chào mừng bạn!',
        description: 'Tài khoản và khách sạn của bạn đã sẵn sàng. Đang chuyển hướng...',
      })

      // Refresh the profile before resolving the first permitted route. The
      // callback presents a retry screen if this read fails after provisioning.
      await refetchUser()
      navigate('/auth/callback', { replace: true })
      
    } catch (error: unknown) {
      if(!current())return
      console.error('ONBOARDING_FAILED')
      const errorMessage = getRegistrationErrorMessage(error)
      
      setError(errorMessage)
      setCompleted(false)
      submissionInFlight.current = false
      if(runtimeConfig.workspace)void setup.refresh()
      
      toast({
        title: 'Lỗi thiết lập',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      submissionInFlight.current=false
      if(mounted.current)setIsSubmitting(false)
    }
  }

  if (profileLoading || invitation.isLoading) return <LoadingSpinner fullScreen />
  if (invitation.data) return <ResumeStaffInvitation invitation={invitation.data} />
  if (invitation.isError) return <AccountSetupNotice onRetry={() => { void invitation.refetch() }} />
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
            Chỉ cần thông tin cơ bản để bắt đầu. Bạn có thể chỉnh sửa sau.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {directorySetup&&(
            <div className="mb-6 rounded-lg border p-4" aria-live="polite">
              <p className="font-medium">{setup.isLoading?'Đang kiểm tra thiết lập đã lưu…':setup.error?'Cần kiểm tra kết quả':
                setup.data?.nextAction==='continue_setup'?'Tiếp tục thiết lập khách sạn':setup.data?.step==='active'?'Khách sạn đã sẵn sàng':
                setup.data?.nextAction==='contact_support'?'Cần RoomQC đối soát':'Đang xác nhận kết quả thiết lập'}</p>
              <p className="mt-1 text-sm text-muted-foreground">{setup.error||(setup.data?.nextAction==='contact_support'
                ?'Giữ nguyên đăng ký này và cung cấp mã hỗ trợ cho RoomQC để kiểm tra kết quả.'
                :setup.data?.nextAction==='wait'?'Hệ thống sẽ kiểm tra lại tiến độ. Vui lòng giữ nguyên đăng ký này.'
                :'Thông tin đã gửi sẽ được kiểm tra để tránh tạo trùng khách sạn.')}</p>
              {setup.data&&setup.data.nextAction!=='continue_setup'&&<p className="mt-2 break-all text-xs">Mã hỗ trợ: {setup.data.requestId}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {(setup.data?.step==='active'||setup.data?.lastErrorCode==='DIRECTORY_ACTIVATION_PENDING')&&
                  <Button type="button" onClick={()=>window.location.assign(workspacePath('/auth/callback'))}>Mở khách sạn</Button>}
                {(!setup.data||setup.data.nextAction!=='continue_setup')&&
                  <Button type="button" variant="outline" disabled={setup.isLoading||isSubmitting} onClick={()=>{void setup.refresh()}}>Kiểm tra lại kết quả</Button>}
              </div>
            </div>
          )}
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
            <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
              <fieldset disabled={isSubmitting || completed || !canSetup} className="space-y-6">
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
                    name="tenantPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Số điện thoại liên hệ *</FormLabel>
                        <FormControl>
                          <Input type="tel" autoComplete="tel" placeholder="0901234567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <p className="text-sm text-muted-foreground">Email liên hệ mặc định: {user?.email}. Số phòng chỉ là quy mô dự kiến; danh sách phòng sẽ được tạo ở bước sau.</p>
              </div>

              <details className="rounded-lg border p-4" open={!!(form.formState.errors.tenantName || form.formState.errors.hotelPhone || form.formState.errors.hotelEmail) || undefined}>
                <summary className="cursor-pointer text-sm font-medium">Thông tin bổ sung (không bắt buộc)</summary>
                <p className="mt-3 text-sm text-muted-foreground">Để trống để dùng tên khách sạn, số điện thoại và email ở trên.</p>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField control={form.control} name="tenantName" render={({ field }) => (
                    <FormItem><FormLabel>Tên công ty / đơn vị quản lý</FormLabel><FormControl><Input placeholder="Mặc định dùng tên khách sạn" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="hotelPhone" render={({ field }) => (
                    <FormItem><FormLabel>Điện thoại khách sạn (nếu khác)</FormLabel><FormControl><Input type="tel" placeholder="Mặc định dùng số liên hệ" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField
                    control={form.control}
                    name="hotelEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email khách sạn (nếu khác)</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="info@hotel.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </details>

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
