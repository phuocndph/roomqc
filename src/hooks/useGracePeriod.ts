import { useTenantSubscription } from './useSubscription';

export interface GracePeriodStatus {
  isExpired: boolean;
  isInGracePeriod: boolean;
  isGracePeriodExpired: boolean;
  isExpiringSoon: boolean;
  daysUntilExpiry: number;
  graceDaysRemaining: number;
  graceEndDate: Date | null;
  subscriptionEndDate: Date | null;
  subscriptionStatus: string | null;
  isLoading: boolean;
}

const EXPIRING_SOON_DAYS = 7;

export function useGracePeriod(): GracePeriodStatus {
  const { data: subscription, isLoading } = useTenantSubscription();

  const now = new Date();
  
  const endDate = subscription?.subscription_end_date
    ? new Date(subscription.subscription_end_date)
    : null;
    
  const graceEndDate = subscription?.grace_period_ends_at
    ? new Date(subscription.grace_period_ends_at)
    : null;

  const subscriptionStatus = subscription?.subscription_status || null;

  const isExpired = endDate ? endDate < now : false;
  const isInGracePeriod = isExpired && graceEndDate ? now < graceEndDate : false;
  const isGracePeriodExpired = graceEndDate ? now >= graceEndDate : false;

  // Expiring soon: not yet expired, but ≤7 days remaining
  const daysUntilExpiry = endDate && !isExpired
    ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const isExpiringSoon = !isExpired && daysUntilExpiry > 0 && daysUntilExpiry <= EXPIRING_SOON_DAYS;

  const graceDaysRemaining = isInGracePeriod && graceEndDate
    ? Math.ceil((graceEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    isExpired,
    isInGracePeriod,
    isGracePeriodExpired,
    isExpiringSoon,
    daysUntilExpiry,
    graceDaysRemaining,
    graceEndDate,
    subscriptionEndDate: endDate,
    subscriptionStatus,
    isLoading,
  };
}

export function calculateGracePeriodStatus(
  subscriptionEndDate: string | null,
  gracePeriodEndsAt: string | null
): Omit<GracePeriodStatus, 'subscriptionStatus' | 'isLoading'> {
  const now = new Date();
  
  const endDate = subscriptionEndDate ? new Date(subscriptionEndDate) : null;
  const graceEndDate = gracePeriodEndsAt ? new Date(gracePeriodEndsAt) : null;

  const isExpired = endDate ? endDate < now : false;
  const isInGracePeriod = isExpired && graceEndDate ? now < graceEndDate : false;
  const isGracePeriodExpired = graceEndDate ? now >= graceEndDate : false;

  const daysUntilExpiry = endDate && !isExpired
    ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const isExpiringSoon = !isExpired && daysUntilExpiry > 0 && daysUntilExpiry <= EXPIRING_SOON_DAYS;

  const graceDaysRemaining = isInGracePeriod && graceEndDate
    ? Math.ceil((graceEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    isExpired,
    isInGracePeriod,
    isGracePeriodExpired,
    isExpiringSoon,
    daysUntilExpiry,
    graceDaysRemaining,
    graceEndDate,
    subscriptionEndDate: endDate,
  };
}
