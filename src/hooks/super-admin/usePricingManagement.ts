import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useAllPlans() {
  return useQuery({
    queryKey: ['all-subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_monthly', { ascending: true }) as any

      if (error) throw error
      return data
    },
  })
}

export function useActiveSubscriptionPlans() {
  return useQuery({
    queryKey: ['subscription-plans', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}

export function usePlan(planId: string | null) {
  return useQuery({
    queryKey: ['subscription-plan', planId],
    queryFn: async () => {
      if (!planId) return null;

      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!planId,
  });
}

export function usePlanPriceHistory(planId: string | null) {
  return useQuery({
    queryKey: ['plan-price-history', planId],
    queryFn: async () => {
      if (!planId) return null;

      const { data, error } = await supabase
        .from('plan_price_history')
        .select(`
          *,
          changed_by_admin:users(full_name, email)
        `)
        .eq('plan_id', planId)
        .order('changed_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!planId,
  });
}

export function usePlansWithTenantCounts() {
  return useQuery({
    queryKey: ['plans-with-tenant-counts'],
    queryFn: async () => {
      const { data: plans, error: plansError } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_monthly', { ascending: true });

      if (plansError) throw plansError;

      const plansWithCounts = await Promise.all(
        plans.map(async (plan) => {
          const { count, error: countError } = await supabase
            .from('tenants')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_plan_id', plan.id)
            .eq('subscription_status', 'active');

          if (countError) throw countError;

          return {
            ...plan,
            activeTenantCount: count || 0,
          };
        })
      );

      return plansWithCounts;
    },
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (plan: any) => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .insert(plan)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-subscription-plans'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      toast.success('Đã tạo gói đăng ký');
    },
    onError: (error: any) => {
      toast.error('Lỗi tạo gói: ' + error.message);
    },
  });
}

export function useUpdatePlanPricing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      planId,
      newMonthlyPrice,
      newYearlyPrice,
      pricePerRoomDaily,
      minSubscriptionDays,
      changedBy,
      reason,
    }: {
      planId: string;
      newMonthlyPrice: number;
      newYearlyPrice: number;
      pricePerRoomDaily?: number;
      minSubscriptionDays?: number;
      changedBy: string;
      reason?: string;
    }) => {
      const { data: currentPlan, error: fetchError } = await supabase
        .from('subscription_plans')
        .select('price_monthly, price_yearly, price_per_room_daily, min_subscription_days')
        .eq('id', planId)
        .single();

      if (fetchError) throw fetchError;

      const { error: historyError } = await supabase
        .from('plan_price_history')
        .insert({
          plan_id: planId,
          old_price_monthly: currentPlan.price_monthly,
          old_price_yearly: currentPlan.price_yearly,
          new_price_monthly: newMonthlyPrice,
          new_price_yearly: newYearlyPrice,
          changed_by: changedBy,
          reason: reason,
        });

      if (historyError) throw historyError;

      const updateData: any = {
        price_monthly: newMonthlyPrice,
        price_yearly: newYearlyPrice,
      };

      if (pricePerRoomDaily !== undefined) {
        updateData.price_per_room_daily = pricePerRoomDaily;
      }
      if (minSubscriptionDays !== undefined) {
        updateData.min_subscription_days = minSubscriptionDays;
      }

      const { data, error } = await supabase
        .from('subscription_plans')
        .update(updateData)
        .eq('id', planId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['all-subscription-plans'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-plan', variables.planId] });
      queryClient.invalidateQueries({ queryKey: ['plan-price-history', variables.planId] });
      queryClient.invalidateQueries({ queryKey: ['plans-with-tenant-counts'] });
      toast.success('Đã cập nhật giá');
    },
    onError: (error: any) => {
      toast.error('Lỗi cập nhật giá: ' + error.message);
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string; 
      updates: any;
    }) => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['all-subscription-plans'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-plan', variables.id] });
      toast.success('Đã cập nhật gói');
    },
    onError: (error: any) => {
      toast.error('Lỗi cập nhật: ' + error.message);
    },
  });
}

export function useArchivePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (planId: string) => {
      const { count, error: countError } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .eq('subscription_plan_id', planId)
        .eq('subscription_status', 'active');

      if (countError) throw countError;

      if (count && count > 0) {
        throw new Error(
          `Không thể lưu trữ: ${count} tenant đang sử dụng gói này.`
        );
      }

      const { data, error } = await supabase
        .from('subscription_plans')
        .update({ is_active: false })
        .eq('id', planId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-subscription-plans'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      toast.success('Đã lưu trữ gói');
    },
    onError: (error: any) => {
      toast.error('Lỗi lưu trữ: ' + error.message);
    },
  });
}

export function useReactivatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (planId: string) => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .update({ is_active: true })
        .eq('id', planId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-subscription-plans'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      toast.success('Đã kích hoạt lại gói');
    },
    onError: (error: any) => {
      toast.error('Lỗi kích hoạt: ' + error.message);
    },
  });
}
