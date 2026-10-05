import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUser } from '@/hooks/useUser';
import { toast } from 'sonner';

export interface NotificationPreferences {
  id: string;
  user_id: string;
  tenant_id: string;
  
  // Push notifications
  push_enabled: boolean;
  
  // Email notifications
  email_low_stock: boolean;
  email_laundry_completed: boolean;
  email_maintenance_new: boolean;
  email_po_approved: boolean;
  email_daily_report: boolean;
  email_weekly_report: boolean;
  email_dead_stock_digest: boolean;
  email_critical_stock: boolean;
  
  // In-app notifications
  inapp_realtime: boolean;
  inapp_low_stock: boolean;
  inapp_laundry_completed: boolean;
  inapp_laundry_delayed: boolean;
  inapp_maintenance_new: boolean;
  inapp_task_assigned: boolean;
  inapp_approval_request: boolean;
  inapp_booking_events: boolean;
  
  // Thresholds
  low_stock_threshold: number;
  critical_stock_threshold: number;
  overdue_maintenance_days: number;
  laundry_delay_hours: number;
  
  // Schedule
  daily_report_time: string;
  weekly_report_day: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  
  created_at: string;
  updated_at: string;
}

const defaultPreferences: Omit<NotificationPreferences, 'id' | 'user_id' | 'tenant_id' | 'created_at' | 'updated_at'> = {
  push_enabled: true,
  email_low_stock: true,
  email_laundry_completed: true,
  email_maintenance_new: true,
  email_po_approved: true,
  email_daily_report: false,
  email_weekly_report: true,
  email_dead_stock_digest: true,
  email_critical_stock: true,
  inapp_realtime: true,
  inapp_low_stock: true,
  inapp_laundry_completed: true,
  inapp_laundry_delayed: true,
  inapp_maintenance_new: true,
  inapp_task_assigned: true,
  inapp_approval_request: true,
  inapp_booking_events: true,
  low_stock_threshold: 20,
  critical_stock_threshold: 5,
  overdue_maintenance_days: 3,
  laundry_delay_hours: 24,
  daily_report_time: '08:00',
  weekly_report_day: 1,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
};

export function useNotificationPreferences() {
  const { user: authUser } = useAuth();
  const { tenantId } = useUser();
  const queryClient = useQueryClient();

  const { data: preferences, isLoading, error } = useQuery({
    queryKey: ['notification-preferences', authUser?.id],
    queryFn: async () => {
      if (!authUser?.id) return null;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (error) throw error;
      
      // Return data with defaults for any missing fields
      if (data) {
        return { ...defaultPreferences, ...data } as NotificationPreferences;
      }
      
      return null;
    },
    enabled: !!authUser?.id,
  });

  const createPreferencesMutation = useMutation({
    mutationFn: async (prefs: Partial<NotificationPreferences>) => {
      if (!authUser?.id || !tenantId) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('notification_preferences')
        .insert({
          user_id: authUser.id,
          tenant_id: tenantId,
          ...defaultPreferences,
          ...prefs,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('Đã lưu cài đặt thông báo');
    },
    onError: (error) => {
      console.error('Error creating preferences:', error);
      toast.error('Không thể lưu cài đặt thông báo');
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (prefs: Partial<NotificationPreferences>) => {
      if (!authUser?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('notification_preferences')
        .update(prefs)
        .eq('user_id', authUser.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('Đã cập nhật cài đặt thông báo');
    },
    onError: (error) => {
      console.error('Error updating preferences:', error);
      toast.error('Không thể cập nhật cài đặt thông báo');
    },
  });

  const savePreferences = async (prefs: Partial<NotificationPreferences>) => {
    if (preferences) {
      return updatePreferencesMutation.mutateAsync(prefs);
    } else {
      return createPreferencesMutation.mutateAsync(prefs);
    }
  };

  return {
    preferences: preferences || defaultPreferences as NotificationPreferences,
    isLoading,
    error,
    savePreferences,
    isSaving: createPreferencesMutation.isPending || updatePreferencesMutation.isPending,
  };
}
