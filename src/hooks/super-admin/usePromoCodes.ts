import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { PromotionalCode, PromoCodeUsage } from '@/types/super-admin.types';

export function usePromoCodes(filters?: {
  isActive?: boolean;
  discountType?: 'percentage' | 'fixed_amount';
}) {
  return useQuery({
    queryKey: ['promo-codes', filters],
    queryFn: async () => {
      let query = supabase
        .from('promotional_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      if (filters?.discountType) {
        query = query.eq('discount_type', filters.discountType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PromotionalCode[];
    },
  });
}

export function usePromoCode(codeId: string | null) {
  return useQuery({
    queryKey: ['promo-code', codeId],
    queryFn: async () => {
      if (!codeId) return null;

      const { data, error } = await supabase
        .from('promotional_codes')
        .select('*')
        .eq('id', codeId)
        .single();

      if (error) throw error;
      return data as PromotionalCode;
    },
    enabled: !!codeId,
  });
}

export function usePromoCodeUsage(codeId: string | null) {
  return useQuery({
    queryKey: ['promo-code-usage', codeId],
    queryFn: async () => {
      if (!codeId) return null;

      const { data, error } = await supabase
        .from('promo_code_usage')
        .select(`
          *,
          tenant:tenants(name)
        `)
        .eq('promo_code_id', codeId)
        .order('used_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!codeId,
  });
}

export function useCreatePromoCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (promoCode: Omit<PromotionalCode, 'id' | 'created_at' | 'updated_at' | 'current_uses'>) => {
      const { data, error } = await supabase
        .from('promotional_codes')
        .insert(promoCode)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
      toast.success('Đã tạo mã khuyến mãi');
    },
    onError: (error: any) => {
      toast.error('Lỗi tạo mã: ' + error.message);
    },
  });
}

export function useUpdatePromoCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string; 
      updates: Partial<PromotionalCode>;
    }) => {
      const { data, error } = await supabase
        .from('promotional_codes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
      queryClient.invalidateQueries({ queryKey: ['promo-code', variables.id] });
      toast.success('Đã cập nhật mã khuyến mãi');
    },
    onError: (error: any) => {
      toast.error('Lỗi cập nhật: ' + error.message);
    },
  });
}

export function useDeletePromoCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (codeId: string) => {
      const { data, error } = await supabase
        .from('promotional_codes')
        .update({ is_active: false })
        .eq('id', codeId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
      toast.success('Đã vô hiệu hóa mã khuyến mãi');
    },
    onError: (error: any) => {
      toast.error('Lỗi xóa mã: ' + error.message);
    },
  });
}

export function useApplyPromoCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      code,
      tenantId,
      originalAmount,
    }: {
      code: string;
      tenantId: string;
      originalAmount: number;
    }) => {
      const { data, error } = await supabase.rpc('apply_promo_code', {
        p_tenant_id: tenantId,
        p_promo_code: code,
        p_original_amount: originalAmount,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Đã áp dụng mã khuyến mãi');
    },
    onError: (error: any) => {
      toast.error('Lỗi áp dụng mã: ' + error.message);
    },
  });
}
