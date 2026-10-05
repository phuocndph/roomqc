import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSendEmailNotification } from '@/hooks/useEmailNotification'
import { toast } from '@/hooks/use-toast'
import { Send } from 'lucide-react'
import { getFriendlyError } from '@/lib/errorMessage'

export function TestEmailNotifications() {
  const [email, setEmail] = useState('')
  const [notificationType, setNotificationType] = useState('subscription_expiring')
  const sendEmail = useSendEmailNotification()

  const handleSendTest = async () => {
    if (!email) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng nhập địa chỉ email',
        variant: 'destructive',
      })
      return
    }

    const templateData: Record<string, any> = {}

    switch (notificationType) {
      case 'subscription_expiring':
        templateData.tenant_name = 'Demo Hotel'
        templateData.plan_name = 'Professional'
        templateData.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        templateData.days_remaining = 7
        templateData.renewal_url = `${window.location.origin}/settings/subscription`
        break

      case 'payment_succeeded':
        templateData.tenant_name = 'Demo Hotel'
        templateData.amount = 500000
        templateData.currency = 'VND'
        templateData.plan_name = 'Professional'
        templateData.next_billing_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        break

      case 'payment_failed':
        templateData.tenant_name = 'Demo Hotel'
        templateData.amount = 500000
        templateData.currency = 'VND'
        templateData.plan_name = 'Professional'
        templateData.failure_reason = 'Thẻ hết hạn'
        templateData.update_payment_url = `${window.location.origin}/settings/subscription`
        break

      case 'quota_warning':
        templateData.tenant_name = 'Demo Hotel'
        templateData.resource_type = 'user'
        templateData.current_usage = 85
        templateData.limit = 100
        templateData.percentage = 85
        templateData.upgrade_url = `${window.location.origin}/settings/subscription`
        break
    }

    try {
      await sendEmail.mutateAsync({
        notification_type: notificationType as any,
        to_email: email,
        to_name: 'Demo User',
        template_data: templateData,
      })

      toast({
        title: 'Thành công',
        description: `Email ${notificationType} đã được gửi đến ${email}`,
      })
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error) || 'Không thể gửi email',
        variant: 'destructive',
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test Email Notifications</CardTitle>
        <CardDescription>
          Kiểm thử hệ thống gửi email thông báo tự động
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email nhận</Label>
          <Input
            id="email"
            type="email"
            placeholder="test@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notification_type">Loại thông báo</Label>
          <Select value={notificationType} onValueChange={setNotificationType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="subscription_expiring">
                Gói đăng ký sắp hết hạn
              </SelectItem>
              <SelectItem value="payment_succeeded">
                Thanh toán thành công
              </SelectItem>
              <SelectItem value="payment_failed">
                Thanh toán thất bại
              </SelectItem>
              <SelectItem value="quota_warning">
                Cảnh báo quota
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleSendTest}
          disabled={sendEmail.isPending}
          className="w-full gap-2"
        >
          <Send className="h-4 w-4" />
          {sendEmail.isPending ? 'Đang gửi...' : 'Gửi email test'}
        </Button>
      </CardContent>
    </Card>
  )
}
