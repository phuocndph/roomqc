import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BankPaymentSettings {
  id: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  payment_prefix: string;
  qr_template: string;
  is_active: boolean;
  hotel_id: string | null;
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBankPaymentSettingsInput {
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  payment_prefix?: string;
  qr_template?: string;
  is_active?: boolean;
  hotel_id: string;
  tenant_id: string;
}

/**
 * Get active bank payment settings for a specific hotel
 * @param hotelId - Hotel ID to filter by (required for hotel-specific settings)
 */
/**
 * Get active bank payment settings for a specific hotel
 * @param hotelId - Hotel ID to filter by (required for hotel-specific settings)
 */
export function useBankPaymentSettings(hotelId?: string) {
  return useQuery({
    queryKey: ['bank-payment-settings', hotelId],
    queryFn: async () => {
      if (!hotelId) return null;

      const { data, error } = await supabase
        .from('bank_payment_settings')
        .select('*')
        .eq('is_active', true)
        .eq('hotel_id', hotelId)
        .maybeSingle();

      if (error) throw error;
      return data as BankPaymentSettings | null;
    },
    enabled: !!hotelId, // Only run when hotelId is available
  });
}

/**
 * Get all bank payment settings for management purposes
 */
export function useAllBankPaymentSettings(tenantId?: string) {
  return useQuery({
    queryKey: ['bank-payment-settings', 'all', tenantId],
    queryFn: async () => {
      let query = supabase
        .from('bank_payment_settings')
        .select('*')
        .order('created_at', { ascending: false });

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as BankPaymentSettings[];
    },
    enabled: !!tenantId,
  });
}

/**
 * Get bank payment settings for a specific hotel
 */
export function useHotelBankPaymentSettings(hotelId?: string) {
  return useQuery({
    queryKey: ['bank-payment-settings', 'hotel', hotelId],
    queryFn: async () => {
      if (!hotelId) return null;

      const { data, error } = await supabase
        .from('bank_payment_settings')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      return data as BankPaymentSettings | null;
    },
    enabled: !!hotelId,
  });
}

export function useSuperAdminBankPaymentSettings() {
  return useQuery({
    queryKey: ['bank-payment-settings', 'super-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_payment_settings')
        .select('*')
        .is('hotel_id', null)
        .is('tenant_id', null)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data as BankPaymentSettings | null;
    },
  });
}

export function useCreateBankPaymentSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: CreateBankPaymentSettingsInput) => {
      // Deactivate existing settings for this hotel first
      if (settings.hotel_id) {
        await supabase
          .from('bank_payment_settings')
          .update({ is_active: false })
          .eq('hotel_id', settings.hotel_id)
          .eq('is_active', true);
      } else {
        // Super admin: deactivate records without hotel_id/tenant_id
        await supabase
          .from('bank_payment_settings')
          .update({ is_active: false })
          .is('hotel_id', null)
          .is('tenant_id', null)
          .eq('is_active', true);
      }

      const { data, error } = await supabase
        .from('bank_payment_settings')
        .insert({
          ...settings,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bank-payment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['bank-payment-settings', 'hotel', variables.hotel_id] });
      toast.success('Đã lưu thông tin thanh toán');
    },
    onError: (error) => {
      console.error('Error saving bank settings:', error);
      toast.error('Không thể lưu thông tin thanh toán');
    },
  });
}

export function useUpdateBankPaymentSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...settings }: Partial<BankPaymentSettings> & { id: string }) => {
      const { data, error } = await supabase
        .from('bank_payment_settings')
        .update(settings)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as BankPaymentSettings;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bank-payment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['bank-payment-settings', 'hotel', data.hotel_id] });
      toast.success('Đã cập nhật thông tin thanh toán');
    },
    onError: (error) => {
      console.error('Error updating bank settings:', error);
      toast.error('Không thể cập nhật thông tin thanh toán');
    },
  });
}

export function useDeleteBankPaymentSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('bank_payment_settings')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-payment-settings'] });
      toast.success('Đã xóa thông tin thanh toán');
    },
    onError: (error) => {
      console.error('Error deleting bank settings:', error);
      toast.error('Không thể xóa thông tin thanh toán');
    },
  });
}
