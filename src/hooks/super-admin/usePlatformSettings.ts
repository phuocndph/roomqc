import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PlatformSettings {
  trial_period_days: number;
  grace_period_days: number;
  default_rooms: number;
  price_per_room_day: number;
  platform_name: string;
  support_email: string;
  maintenance_mode: boolean;
  maintenance_message: string;
  system_announcement: string;
}

interface PlatformSettingRow {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*');

      if (error) throw error;

      // Convert array to object for easy access
      const settings: Record<string, any> = {};
      (data as PlatformSettingRow[])?.forEach((item) => {
        try {
          settings[item.key] = JSON.parse(item.value as string);
        } catch {
          settings[item.key] = item.value;
        }
      });

      return settings as PlatformSettings;
    },
  });
}

export function useUpdatePlatformSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const { error } = await supabase
        .from('platform_settings')
        .update({
          value: JSON.stringify(value),
          updated_at: new Date().toISOString(),
        })
        .eq('key', key);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      toast.success('Đã lưu cài đặt');
    },
    onError: (error) => {
      toast.error('Lỗi khi lưu cài đặt: ' + error.message);
    },
  });
}

export function useUpdateMultiplePlatformSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: { key: string; value: any }[]) => {
      for (const setting of settings) {
        const { error } = await supabase
          .from('platform_settings')
          .update({
            value: JSON.stringify(setting.value),
            updated_at: new Date().toISOString(),
          })
          .eq('key', setting.key);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      toast.success('Đã lưu tất cả cài đặt');
    },
    onError: (error) => {
      toast.error('Lỗi khi lưu cài đặt: ' + error.message);
    },
  });
}

// Hook to get admin activities/audit log
export function useAdminActivities(limit: number = 50) {
  return useQuery({
    queryKey: ['admin-activities', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select(`
          id,
          action,
          entity_type,
          entity_id,
          entity_name,
          description,
          old_values,
          new_values,
          user_name,
          user_role,
          created_at
        `)
        .in('entity_type', ['tenant', 'plan', 'promo_code', 'campaign', 'platform_settings'])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
  });
}
