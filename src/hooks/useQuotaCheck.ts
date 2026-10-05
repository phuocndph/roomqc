import { useState } from 'react'
import { useCheckQuota } from './useTenantUsage'
import { useTenantUsage } from './useTenantUsage'
import { useTenantSubscription } from './useSubscription'

type ResourceType = 'hotel' | 'user' | 'room' | 'item' | 'storage'

export function useQuotaCheck(resourceType: ResourceType) {
  const [showDialog, setShowDialog] = useState(false)
  const { data: canAdd, isLoading, refetch } = useCheckQuota(resourceType)
  const { data: usage } = useTenantUsage()
  const { data: subscription } = useTenantSubscription()

  const checkQuota = async (): Promise<boolean> => {
    // Always fetch fresh data before checking
    const result = await refetch()
    const freshCanAdd = result.data
    
    if (isLoading || !usage || !subscription) {
      return true // Allow if still loading
    }

    if (freshCanAdd) {
      return true
    }

    // Show dialog if quota exceeded
    setShowDialog(true)
    return false
  }

  const getCurrentUsage = (): number => {
    if (!usage) return 0

    switch (resourceType) {
      case 'hotel':
        return usage.current_hotels_count || 0
      case 'user':
        return usage.current_users_count || 0
      case 'room':
        return usage.current_rooms_count || 0
      case 'item':
        return usage.current_items_count || 0
      case 'storage':
        return usage.current_storage_bytes || 0
      default:
        return 0
    }
  }

  const getLimit = (): number => {
    if (!subscription?.subscription_plan) return 0
    
    const plan = subscription.subscription_plan as any

    switch (resourceType) {
      case 'hotel':
        return plan.max_hotels || 0
      case 'user':
        return plan.max_users || 0
      case 'room':
        return plan.max_rooms || 0
      case 'item':
        return plan.max_items || 0
      case 'storage':
        return plan.max_storage_gb || 0
      default:
        return 0
    }
  }

  return {
    checkQuota,
    canAdd: canAdd ?? true,
    isLoading,
    showDialog,
    setShowDialog,
    currentUsage: getCurrentUsage(),
    limit: getLimit(),
    refetch,
  }
}
