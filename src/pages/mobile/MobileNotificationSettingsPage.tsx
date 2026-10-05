import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { navigateBack } from '@/lib/navigation'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible'
import { 
  ArrowLeft, 
  Bell, 
  Mail, 
  Smartphone,
  ChevronDown,
  ChevronUp,
  Package,
  Wrench,
  Shirt,
  Clock,
  Loader2,
  Send,
  Settings2
} from 'lucide-react'
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { triggerNotification } from '@/hooks/useNotificationTriggers'
import { useUser } from '@/hooks/useUser'
import { toast } from '@/hooks/use-toast'
import { NotificationEventTypesCard } from '@/components/settings/notifications/NotificationEventTypesCard'

export default function MobileNotificationSettingsPage() {
  const navigate = useNavigate()
  const { user, tenantId, hasAnyRole } = useUser()
  const isAdmin = hasAnyRole(['super_admin', 'owner', 'hotel_manager', 'department_manager'])
  const { preferences, isLoading, savePreferences, isSaving } = useNotificationPreferences()
  const { 
    isSubscribed, 
    isSupported, 
    permission, 
    error: pushError,
    subscribe, 
    unsubscribe, 
    isLoading: pushLoading 
  } = usePushNotifications()
  
  const [localPrefs, setLocalPrefs] = useState(preferences)
  const [hasChanges, setHasChanges] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  
  // Section collapse states
  const [pushOpen, setPushOpen] = useState(true)
  const [emailOpen, setEmailOpen] = useState(false)
  const [inAppOpen, setInAppOpen] = useState(false)
  const [thresholdsOpen, setThresholdsOpen] = useState(false)

  useEffect(() => {
    if (preferences) {
      setLocalPrefs(preferences)
    }
  }, [preferences])

  const handleChange = (key: string, value: any) => {
    setLocalPrefs(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    await savePreferences(localPrefs)
    setHasChanges(false)
    toast({ title: 'Đã lưu cài đặt thông báo' })
  }

  const handleSendTestNotification = async () => {
    if (!user?.id || !tenantId) return

    setSendingTest(true)
    try {
      // Nếu thiết bị hiện tại chưa subscribe và có thể subscribe, thử subscribe
      if (isSupported && permission !== 'denied' && !isSubscribed) {
        await subscribe()
      }

      // LUÔN gọi triggerNotification với sendPush = true
      // Vì user có thể có thiết bị khác đã đăng ký nhận push
      const result = await triggerNotification(
        user.id,
        tenantId,
        '🔔 Thông báo test',
        'Đây là thông báo test từ hệ thống. Nếu bạn nhận được thì cài đặt đã hoạt động!',
        'info',
        '/settings/notifications',
        true // LUÔN true để edge function được gọi
      )

      // Hiển thị kết quả chi tiết
      if (result.push.sent && result.push.sent > 0) {
        toast({
          title: 'Đã gửi thông báo test',
          description: `Đã gửi Web Push đến ${result.push.sent} thiết bị`
        })
      } else if (!result.push.ok) {
        toast({
          title: 'Thông báo in-app đã gửi',
          description: result.push.message || 'Chưa có thiết bị nào đăng ký nhận Web Push',
        })
      } else {
        toast({
          title: 'Đã gửi thông báo test',
          description: 'Kiểm tra trong trung tâm thông báo'
        })
      }
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: 'Không thể gửi thông báo test',
        variant: 'destructive'
      })
    } finally {
      setSendingTest(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/settings/notifications')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-semibold">Cài đặt thông báo</h1>
          </div>
          {isAdmin && hasChanges && (
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Test Notification */}
        <div className="rounded-lg border p-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Send className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Gửi thông báo test</p>
                <p className="text-sm text-muted-foreground">Kiểm tra hệ thống thông báo</p>
              </div>
            </div>
            <Button 
              size="sm" 
              onClick={handleSendTestNotification}
              disabled={sendingTest}
            >
              {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
            </Button>
          </div>
        </div>

        {/* Push Notifications Section */}
        <Collapsible open={pushOpen} onOpenChange={setPushOpen}>
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">Push Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    {isSubscribed ? 'Đã bật' : 'Chưa bật'}
                  </p>
                </div>
              </div>
              {pushOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 p-4 rounded-lg border bg-card space-y-4">
              {permission === 'denied' ? (
                <p className="text-sm text-destructive">
                  Bạn đã chặn thông báo. Vui lòng bật lại trong cài đặt trình duyệt.
                </p>
              ) : !isSupported ? (
                <p className="text-sm text-amber-600">
                  {pushError || 'Trình duyệt hiện tại không hỗ trợ Web Push.'}
                </p>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Nhận thông báo đẩy</p>
                    <p className="text-sm text-muted-foreground">
                      Nhận thông báo ngay cả khi không mở app
                    </p>
                  </div>
                  {isSubscribed ? (
                    <Badge variant="secondary">Đã bật</Badge>
                  ) : (
                    <Button 
                      size="sm" 
                      onClick={subscribe} 
                      disabled={pushLoading || !isSupported}
                    >
                      {pushLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Bật ngay'}
                    </Button>
                  )}
                </div>
              )}
              
              {isSubscribed && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Label>Tắt thông báo đẩy</Label>
                    <Button variant="outline" size="sm" onClick={unsubscribe}>
                      Hủy đăng ký
                    </Button>
                  </div>
                  <Separator />
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => navigate('/settings/notifications/devices')}
                  >
                    <Settings2 className="h-4 w-4 mr-2" />
                    Quản lý thiết bị
                  </Button>
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Event-level notification types */}
        <NotificationEventTypesCard
          prefs={localPrefs}
          pushSubscribed={isSubscribed}
          onChange={(key, value) => handleChange(key as string, value)}
        />



        {/* Admin-only settings */}
        {isAdmin && (
          <>
            {/* Email Notifications Section */}
            <Collapsible open={emailOpen} onOpenChange={setEmailOpen}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-primary" />
                    <div className="text-left">
                      <p className="font-medium">Email</p>
                      <p className="text-sm text-muted-foreground">
                        {localPrefs?.email_low_stock || localPrefs?.email_laundry_completed 
                          ? 'Đang bật' : 'Tắt'}
                      </p>
                    </div>
                  </div>
                  {emailOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 p-4 rounded-lg border bg-card space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      <Label>Cảnh báo tồn kho thấp</Label>
                    </div>
                    <Switch
                      checked={localPrefs?.email_low_stock}
                      onCheckedChange={(v) => handleChange('email_low_stock', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shirt className="h-4 w-4" />
                      <Label>Đồ giặt hoàn thành</Label>
                    </div>
                    <Switch
                      checked={localPrefs?.email_laundry_completed}
                      onCheckedChange={(v) => handleChange('email_laundry_completed', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      <Label>Yêu cầu bảo trì mới</Label>
                    </div>
                    <Switch
                      checked={localPrefs?.email_maintenance_new}
                      onCheckedChange={(v) => handleChange('email_maintenance_new', v)}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* In-App Notifications Section */}
            <Collapsible open={inAppOpen} onOpenChange={setInAppOpen}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-primary" />
                    <div className="text-left">
                      <p className="font-medium">Thông báo trong ứng dụng</p>
                      <p className="text-sm text-muted-foreground">
                        {localPrefs?.inapp_realtime ? 'Đang bật' : 'Tắt'}
                      </p>
                    </div>
                  </div>
                  {inAppOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 p-4 rounded-lg border bg-card space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Cập nhật real-time</Label>
                    <Switch
                      checked={localPrefs?.inapp_realtime}
                      onCheckedChange={(v) => handleChange('inapp_realtime', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Cảnh báo tồn kho</Label>
                    <Switch
                      checked={localPrefs?.inapp_low_stock}
                      onCheckedChange={(v) => handleChange('inapp_low_stock', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Công việc được giao</Label>
                    <Switch
                      checked={localPrefs?.inapp_task_assigned}
                      onCheckedChange={(v) => handleChange('inapp_task_assigned', v)}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Thresholds Section */}
            <Collapsible open={thresholdsOpen} onOpenChange={setThresholdsOpen}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-primary" />
                    <div className="text-left">
                      <p className="font-medium">Ngưỡng cảnh báo</p>
                      <p className="text-sm text-muted-foreground">Tùy chỉnh ngưỡng</p>
                    </div>
                  </div>
                  {thresholdsOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 p-4 rounded-lg border bg-card space-y-4">
                  <div className="space-y-2">
                    <Label>Ngưỡng tồn kho thấp (%)</Label>
                    <Input
                      type="number" min={0}
                      value={localPrefs?.low_stock_threshold || 20}
                      onChange={(e) => handleChange('low_stock_threshold', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ngưỡng tồn kho nguy hiểm (%)</Label>
                    <Input
                      type="number" min={0}
                      value={localPrefs?.critical_stock_threshold || 10}
                      onChange={(e) => handleChange('critical_stock_threshold', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ngưỡng bảo trì quá hạn (ngày)</Label>
                    <Input
                      type="number" min={0}
                      value={localPrefs?.overdue_maintenance_days || 3}
                      onChange={(e) => handleChange('overdue_maintenance_days', parseInt(e.target.value))}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {/* Link to full history */}
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={() => navigate('/notifications')}
        >
          <Bell className="h-4 w-4 mr-2" />
          Xem lịch sử thông báo
        </Button>
      </div>
    </div>
  )
}
