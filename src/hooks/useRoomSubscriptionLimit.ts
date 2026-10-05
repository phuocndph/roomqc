import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/hooks/useUser';
import { useTenantSubscription } from '@/hooks/useSubscription';

interface RoomSubscriptionLimit {
  registeredRooms: number;
  actualRooms: number;
  remainingSlots: number;
  canCreateRoom: boolean;
  isLoading: boolean;
  remainingDays: number;
  subscriptionEndDate: string | null;
  discountPercent: number;
}

export function useRoomSubscriptionLimit(): RoomSubscriptionLimit {
  const { tenantId } = useUser();
  const { data: subscription, isLoading: subscriptionLoading } = useTenantSubscription();

  // Get actual room count from database
  const { data: actualRooms, isLoading: roomsLoading } = useQuery({
    queryKey: ['actual-room-count', tenantId],
    queryFn: async () => {
      if (!tenantId) return 0;
      
      const { count, error } = await supabase
        .from('rooms')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!tenantId,
  });

  const registeredRooms = subscription?.registered_rooms || 0;
  const currentActualRooms = actualRooms || 0;
  const remainingSlots = Math.max(0, registeredRooms - currentActualRooms);
  
  // Calculate remaining days
  const endDate = subscription?.subscription_end_date;
  let remainingDays = 0;
  if (endDate) {
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    remainingDays = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  // Get discount percent based on subscription duration
  const durationDays = subscription?.subscription_duration_days || 30;
  let discountPercent = 0;
  if (durationDays >= 365) discountPercent = 15;
  else if (durationDays >= 180) discountPercent = 10;
  else if (durationDays >= 90) discountPercent = 5;

  return {
    registeredRooms,
    actualRooms: currentActualRooms,
    remainingSlots,
    canCreateRoom: remainingSlots > 0,
    isLoading: subscriptionLoading || roomsLoading,
    remainingDays,
    subscriptionEndDate: endDate || null,
    discountPercent,
  };
}
