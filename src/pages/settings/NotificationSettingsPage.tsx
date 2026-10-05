import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Bell, Smartphone, Loader2, Save, Send, History, Settings2 } from 'lucide-react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useNotificationPreferences, NotificationPreferences } from '@/hooks/useNotificationPreferences'
import { triggerNotification } from '@/hooks/useNotificationTriggers'
import { useUser } from '@/hooks/useUser'
import { toast } from '@/hooks/use-toast'
import { useIsMobile } from '@/hooks/use-mobile'
import MobileNotificationSettingsPage from '@/pages/mobile/MobileNotificationSettingsPage'
import { NotificationEventTypesCard } from '@/components/settings/notifications/NotificationEventTypesCard'

export function NotificationSettingsPage() {
  const { t } = useTranslation(['settings', 'common'])
  const navigate = useNavigate()
  const { user, tenantId, hasAnyRole } = useUser()
  const isAdmin = hasAnyRole(['super_admin', 'owner', 'hotel_manager', 'department_manager'])
  const isMobile = useIsMobile()
  const {
    isSupported,
    isSubscribed,
    isLoading: pushLoading,
    permission,
    error: pushError,
    subscribe,
    unsubscribe,
  } = usePushNotifications()
  const { preferences, isLoading: prefsLoading, savePreferences, isSaving } = useNotificationPreferences()
  
  const [localPrefs, setLocalPrefs] = useState<Partial<NotificationPreferences>>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)

  useEffect(() => {
    if (preferences) {
      setLocalPrefs(preferences)
    }
  }, [preferences])

  const handleChange = (key: keyof NotificationPreferences, value: boolean | number | string) => {
    setLocalPrefs(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    await savePreferences(localPrefs)
    setHasChanges(false)
    toast({ title: t('settings:notifications.toast.saved') })
  }

  const handleCancel = () => {
    setLocalPrefs(preferences)
    setHasChanges(false)
  }

  const handleSendTestNotification = async () => {
    if (!user?.id || !tenantId) {
      toast({ title: t('common:error'), description: t('settings:notifications.toast.userNotFound'), variant: 'destructive' })
      return
    }

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
        '🔔 Test Notification',
        'This is a test notification from the system. If you receive this, the settings are working!',
        'info',
        '/settings/notifications',
        true // LUÔN true để edge function được gọi
      )

      // Hiển thị kết quả chi tiết
      if (result.push.sent && result.push.sent > 0) {
        toast({
          title: t('settings:notifications.toast.testSent'),
          description: `Đã gửi Web Push đến ${result.push.sent} thiết bị`
        })
      } else if (!result.push.ok) {
        toast({
          title: 'Thông báo in-app đã gửi',
          description: result.push.message || 'Chưa có thiết bị nào đăng ký nhận Web Push',
        })
      } else {
        toast({
          title: t('settings:notifications.toast.testSent'),
          description: t('settings:notifications.toast.testSentDesc')
        })
      }
    } catch (error) {
      toast({
        title: t('common:error'),
        description: t('settings:notifications.toast.testError'),
        variant: 'destructive'
      })
    } finally {
      setSendingTest(false)
    }
  }

  // Render mobile version
  if (isMobile) {
    return <MobileNotificationSettingsPage />
  }

  if (prefsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('settings:notifications.pageTitle')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('settings:notifications.pageDescription')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/notifications')}>
            <History className="h-4 w-4 mr-2" />
            {t('settings:notifications.history')}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleSendTestNotification}
            disabled={sendingTest}
          >
            {sendingTest ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {t('settings:notifications.sendTest')}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Push Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              {t('settings:notifications.pushNotifications.title')}
            </CardTitle>
            <CardDescription>{t('settings:notifications.pushNotifications.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {permission === 'denied' ? (
              <div className="text-sm text-destructive">
                {t('settings:notifications.pushNotifications.blocked')}
              </div>
            ) : !isSupported ? (
              <div className="text-sm text-amber-600">
                {pushError || 'Trình duyệt hiện tại không hỗ trợ Web Push.'}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <Label>{t('settings:notifications.pushNotifications.enable')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings:notifications.pushNotifications.enableDescription')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isSubscribed && <Badge variant="secondary">{t('settings:notifications.pushNotifications.enabled')}</Badge>}
                  <Button
                    variant={isSubscribed ? "outline" : "default"}
                    size="sm"
                    onClick={isSubscribed ? unsubscribe : subscribe}
                    disabled={pushLoading || (!isSubscribed && !isSupported)}
                  >
                    {pushLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {isSubscribed ? t('settings:notifications.pushNotifications.turnOff') : t('settings:notifications.pushNotifications.turnOn')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/settings/notifications/devices')}
                  >
                    <Settings2 className="h-4 w-4 mr-2" />
                    {t('settings:notifications.pushNotifications.manageDevices')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Event-level notification types */}
        <NotificationEventTypesCard
          prefs={localPrefs}
          pushSubscribed={isSubscribed}
          onChange={(key, value) => handleChange(key, value)}
        />



        {/* Admin-only settings */}
        {isAdmin && (
          <>
            {/* Email Notifications */}
            <Card>
          <CardHeader>
            <CardTitle>{t('settings:notifications.emailNotifications.title')}</CardTitle>
            <CardDescription>{t('settings:notifications.emailNotifications.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('settings:notifications.emailNotifications.lowStock')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings:notifications.emailNotifications.lowStockDesc')}
                </p>
              </div>
              <Switch 
                checked={localPrefs.email_low_stock ?? true}
                onCheckedChange={(v) => handleChange('email_low_stock', v)}
              />
            </div>
            <Separator />
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('settings:notifications.emailNotifications.laundryCompleted')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings:notifications.emailNotifications.laundryCompletedDesc')}
                </p>
              </div>
              <Switch 
                checked={localPrefs.email_laundry_completed ?? true}
                onCheckedChange={(v) => handleChange('email_laundry_completed', v)}
              />
            </div>
            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('settings:notifications.emailNotifications.maintenanceNew')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings:notifications.emailNotifications.maintenanceNewDesc')}
                </p>
              </div>
              <Switch 
                checked={localPrefs.email_maintenance_new ?? true}
                onCheckedChange={(v) => handleChange('email_maintenance_new', v)}
              />
            </div>
            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('settings:notifications.emailNotifications.poApproved')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings:notifications.emailNotifications.poApprovedDesc')}
                </p>
              </div>
              <Switch 
                checked={localPrefs.email_po_approved ?? true}
                onCheckedChange={(v) => handleChange('email_po_approved', v)}
              />
            </div>
            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('settings:notifications.emailNotifications.dailyReport')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings:notifications.emailNotifications.dailyReportDesc')}
                </p>
              </div>
              <Switch 
                checked={localPrefs.email_daily_report ?? false}
                onCheckedChange={(v) => handleChange('email_daily_report', v)}
              />
            </div>
            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('settings:notifications.emailNotifications.weeklyReport')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings:notifications.emailNotifications.weeklyReportDesc')}
                </p>
              </div>
              <Switch 
                checked={localPrefs.email_weekly_report ?? true}
                onCheckedChange={(v) => handleChange('email_weekly_report', v)}
              />
            </div>
            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Cảnh báo sắp hết hàng (&lt; 7 ngày)</Label>
                <p className="text-sm text-muted-foreground">
                  Email khi có mặt hàng dự kiến hết trong vòng 7 ngày tới
                </p>
              </div>
              <Switch
                checked={(localPrefs as any).email_critical_stock ?? true}
                onCheckedChange={(v) => handleChange('email_critical_stock' as any, v)}
              />
            </div>
            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Báo cáo tồn ứ đọng hàng tuần</Label>
                <p className="text-sm text-muted-foreground">
                  Sáng thứ 2 hàng tuần — danh sách hàng không xuất kho ≥ 90 ngày
                </p>
              </div>
              <Switch
                checked={(localPrefs as any).email_dead_stock_digest ?? true}
                onCheckedChange={(v) => handleChange('email_dead_stock_digest' as any, v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* In-App Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings:notifications.inApp.title')}</CardTitle>
            <CardDescription>{t('settings:notifications.inApp.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t('settings:notifications.inApp.realtime')}</Label>
              <Switch 
                checked={localPrefs.inapp_realtime ?? true}
                onCheckedChange={(v) => handleChange('inapp_realtime', v)}
              />
            </div>
            <Separator />

            <div className="flex items-center justify-between">
              <Label>{t('settings:notifications.inApp.lowStock')}</Label>
              <Switch 
                checked={localPrefs.inapp_low_stock ?? true}
                onCheckedChange={(v) => handleChange('inapp_low_stock', v)}
              />
            </div>
            <Separator />

            <div className="flex items-center justify-between">
              <Label>{t('settings:notifications.inApp.laundryCompleted')}</Label>
              <Switch 
                checked={localPrefs.inapp_laundry_completed ?? true}
                onCheckedChange={(v) => handleChange('inapp_laundry_completed', v)}
              />
            </div>
            <Separator />

            <div className="flex items-center justify-between">
              <Label>{t('settings:notifications.inApp.maintenanceNew')}</Label>
              <Switch 
                checked={localPrefs.inapp_maintenance_new ?? true}
                onCheckedChange={(v) => handleChange('inapp_maintenance_new', v)}
              />
            </div>
            <Separator />

            <div className="flex items-center justify-between">
              <Label>{t('settings:notifications.inApp.taskAssigned')}</Label>
              <Switch 
                checked={localPrefs.inapp_task_assigned ?? true}
                onCheckedChange={(v) => handleChange('inapp_task_assigned', v)}
              />
            </div>
            <Separator />

            <div className="flex items-center justify-between">
              <Label>{t('settings:notifications.inApp.approvalRequest')}</Label>
              <Switch 
                checked={localPrefs.inapp_approval_request ?? true}
                onCheckedChange={(v) => handleChange('inapp_approval_request', v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Alert Thresholds */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings:notifications.thresholds.title')}</CardTitle>
            <CardDescription>{t('settings:notifications.thresholds.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="low-stock">{t('settings:notifications.thresholds.lowStock')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="low-stock"
                    type="number" min={0}
                    value={localPrefs.low_stock_threshold ?? 20}
                    onChange={(e) => handleChange('low_stock_threshold', parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">{t('settings:notifications.thresholds.units')}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="critical-stock">{t('settings:notifications.thresholds.criticalStock')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="critical-stock"
                    type="number" min={0}
                    value={localPrefs.critical_stock_threshold ?? 5}
                    onChange={(e) => handleChange('critical_stock_threshold', parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">{t('settings:notifications.thresholds.units')}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="overdue-maintenance">{t('settings:notifications.thresholds.overdueMaintenance')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="overdue-maintenance"
                    type="number" min={0}
                    value={localPrefs.overdue_maintenance_days ?? 3}
                    onChange={(e) => handleChange('overdue_maintenance_days', parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">{t('settings:notifications.thresholds.days')}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="laundry-delay">{t('settings:notifications.thresholds.laundryDelay')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="laundry-delay"
                    type="number" min={0}
                    value={localPrefs.laundry_delay_hours ?? 24}
                    onChange={(e) => handleChange('laundry_delay_hours', parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">{t('settings:notifications.thresholds.hours')}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings:notifications.schedule.title')}</CardTitle>
            <CardDescription>{t('settings:notifications.schedule.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="daily-time">{t('settings:notifications.schedule.dailyTime')}</Label>
                <Input 
                  id="daily-time" 
                  type="time" 
                  value={localPrefs.daily_report_time ?? '08:00'}
                  onChange={(e) => handleChange('daily_report_time', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="weekly-day">{t('settings:notifications.schedule.weeklyDay')}</Label>
                <select
                  id="weekly-day"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={localPrefs.weekly_report_day ?? 1}
                  onChange={(e) => handleChange('weekly_report_day', parseInt(e.target.value))}
                >
                  <option value={0}>{t('settings:notifications.schedule.weekdays.sunday')}</option>
                  <option value={1}>{t('settings:notifications.schedule.weekdays.monday')}</option>
                  <option value={2}>{t('settings:notifications.schedule.weekdays.tuesday')}</option>
                  <option value={3}>{t('settings:notifications.schedule.weekdays.wednesday')}</option>
                  <option value={4}>{t('settings:notifications.schedule.weekdays.thursday')}</option>
                  <option value={5}>{t('settings:notifications.schedule.weekdays.friday')}</option>
                  <option value={6}>{t('settings:notifications.schedule.weekdays.saturday')}</option>
                </select>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings:notifications.schedule.quietHours')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings:notifications.schedule.quietHoursDesc')}
                  </p>
                </div>
                <Switch 
                  checked={localPrefs.quiet_hours_enabled ?? false}
                  onCheckedChange={(v) => handleChange('quiet_hours_enabled', v)}
                />
              </div>
              
              {localPrefs.quiet_hours_enabled && (
                <div className="flex items-center gap-2">
                  <Input 
                    type="time" 
                    value={localPrefs.quiet_hours_start ?? '22:00'}
                    onChange={(e) => handleChange('quiet_hours_start', e.target.value)}
                    className="w-32" 
                  />
                  <span className="text-muted-foreground">→</span>
                  <Input 
                    type="time" 
                    value={localPrefs.quiet_hours_end ?? '07:00'}
                    onChange={(e) => handleChange('quiet_hours_end', e.target.value)}
                    className="w-32" 
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-4 z-20 flex justify-end gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button variant="outline" onClick={handleCancel} disabled={!hasChanges || isSaving}>
            {t('settings:notifications.actions.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" />
            {t('settings:notifications.actions.save')}
          </Button>
        </div>
          </>
        )}
      </div>
    </div>
  )
}
