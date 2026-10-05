import { AlertTriangle, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTenantUsage } from '@/hooks/useTenantUsage'
import { useTenantSubscription } from '@/hooks/useSubscription'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

export function QuotaWarningBanner({ onDismiss }: { onDismiss?: () => void } = {}) {
  const { data: usage } = useTenantUsage()
  const { data: subscription } = useTenantSubscription()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)

  if (!usage || !subscription || dismissed) {
    return null
  }

  const warnings: Array<{ resource: string; percentage: number }> = []

  // Check hotels
  if (subscription.subscription_plan?.max_hotels) {
    const percentage = ((usage.current_hotels_count || 0) / subscription.subscription_plan.max_hotels) * 100
    if (percentage >= 80) {
      warnings.push({ resource: 'Khách sạn', percentage })
    }
  }

  // Check users
  if (subscription.subscription_plan?.max_users) {
    const percentage = ((usage.current_users_count || 0) / subscription.subscription_plan.max_users) * 100
    if (percentage >= 80) {
      warnings.push({ resource: 'Người dùng', percentage })
    }
  }

  // Check rooms
  const maxRooms = (subscription.subscription_plan as any)?.max_rooms
  if (maxRooms) {
    const percentage = ((usage.current_rooms_count || 0) / maxRooms) * 100
    if (percentage >= 80) {
      warnings.push({ resource: 'Phòng', percentage })
    }
  }

  // Check items
  const maxItems = (subscription.subscription_plan as any)?.max_items
  if (maxItems) {
    const percentage = ((usage.current_items_count || 0) / maxItems) * 100
    if (percentage >= 80) {
      warnings.push({ resource: 'Tài sản', percentage })
    }
  }

  // Check storage
  if (subscription.subscription_plan?.max_storage_gb) {
    const storageGB = usage.current_storage_bytes / (1024 ** 3)
    const percentage = (storageGB / subscription.subscription_plan.max_storage_gb) * 100
    if (percentage >= 80) {
      warnings.push({ resource: 'Lưu trữ', percentage })
    }
  }

  if (warnings.length === 0) {
    return null
  }

  const highestWarning = Math.max(...warnings.map(w => w.percentage))
  const variant = highestWarning >= 95 ? 'destructive' : 'default'
  const bgColor = highestWarning >= 95 
    ? 'bg-destructive/10 dark:bg-destructive/20' 
    : 'bg-yellow-50 dark:bg-yellow-950'
  const borderColor = highestWarning >= 95
    ? 'border-destructive'
    : 'border-yellow-500'

  return (
    <Alert className={`${bgColor} ${borderColor} relative`} variant={variant}>
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <span className="font-medium">Cảnh báo mức sử dụng: </span>
          {warnings.map(w => `${w.resource} (${w.percentage.toFixed(0)}%)`).join(', ')} đang gần đạt giới hạn.
          <Button
            variant="link"
            size="sm"
            onClick={() => navigate('/settings/usage')}
            className="ml-2 h-auto p-0 text-inherit underline"
          >
            Xem chi tiết
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => { setDismissed(true); onDismiss?.() }}
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  )
}
