import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyError } from '@/lib/errorMessage'

/**
 * Get all tenants with subscription details, lifetime revenue, and last activity
 */
export function useTenants() {
  return useQuery({
    queryKey: ['super-admin-tenants'],
    queryFn: async () => {
      // Fetch tenants with subscription and usage
      const { data: tenants, error } = await supabase
        .from('tenants')
        .select(`
          *,
          subscription_plan:subscription_plans(
            id,
            name,
            code,
            price_monthly,
            price_yearly,
            max_hotels,
            max_users,
            max_storage_gb
          ),
          tenant_usage(
            current_hotels_count,
            current_users_count,
            current_rooms_count,
            current_items_count,
            current_storage_bytes,
            peak_hotels_count,
            peak_users_count,
            peak_storage_bytes
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch lifetime revenue for each tenant from invoices
      const tenantIds = tenants?.map(t => t.id) || [];
      
      const { data: invoices } = await supabase
        .from('invoices')
        .select('tenant_id, total_amount, status')
        .in('tenant_id', tenantIds)
        .eq('status', 'paid');

      // Calculate lifetime revenue per tenant
      const revenueByTenant: Record<string, number> = {};
      invoices?.forEach(inv => {
        revenueByTenant[inv.tenant_id] = (revenueByTenant[inv.tenant_id] || 0) + (inv.total_amount || 0);
      });

      // Fetch last activity for each tenant
      const { data: activities } = await supabase
        .from('activity_logs')
        .select('tenant_id, created_at')
        .in('tenant_id', tenantIds)
        .order('created_at', { ascending: false });

      // Get last activity per tenant
      const lastActivityByTenant: Record<string, string> = {};
      activities?.forEach(act => {
        if (!lastActivityByTenant[act.tenant_id]) {
          lastActivityByTenant[act.tenant_id] = act.created_at || '';
        }
      });

      // Merge data and calculate actual status
      const now = new Date();
      return tenants?.map(tenant => {
        const subscriptionEndDate = tenant.subscription_end_date ? new Date(tenant.subscription_end_date) : null;
        const isExpired = subscriptionEndDate && subscriptionEndDate < now;
        const daysUntilExpiry = subscriptionEndDate 
          ? Math.ceil((subscriptionEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const hasSubscription = (tenant.registered_rooms || 0) > 0 && subscriptionEndDate;
        
        // Calculate actual status
        let actualStatus = tenant.subscription_status;
        if (isExpired && tenant.subscription_status !== 'suspended') {
          actualStatus = 'expired';
        } else if (!hasSubscription) {
          actualStatus = 'not_registered';
        }
        
        return {
          ...tenant,
          lifetime_revenue: revenueByTenant[tenant.id] || 0,
          last_activity: lastActivityByTenant[tenant.id] || null,
          actual_status: actualStatus,
          is_expired: isExpired,
          days_until_expiry: daysUntilExpiry,
          has_subscription: hasSubscription,
        };
      }) || [];
    },
  });
}

/**
 * Get single tenant details
 */
export function useTenant(tenantId: string | null) {
  return useQuery({
    queryKey: ['super-admin-tenant', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('tenants')
        .select(`
          *,
          subscription_plan:subscription_plans(*)
        `)
        .eq('id', tenantId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });
}

/**
 * Suspend tenant
 */
export function useSuspendTenant() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (tenantId: string) => {
      const { data, error } = await supabase
        .from('tenants')
        .update({ subscription_status: 'suspended' })
        .eq('id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-tenants'] });
      toast({
        title: 'Tenant Suspended',
        description: 'Tenant has been suspended successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error Suspending Tenant',
        description: getFriendlyError(error),
        variant: 'destructive',
      });
    },
  });
}

/**
 * Reactivate tenant
 */
export function useReactivateTenant() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (tenantId: string) => {
      const { data, error } = await supabase
        .from('tenants')
        .update({ subscription_status: 'active' })
        .eq('id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-tenants'] });
      toast({
        title: 'Tenant Reactivated',
        description: 'Tenant has been reactivated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error Reactivating Tenant',
        description: getFriendlyError(error),
        variant: 'destructive',
      });
    },
  });
}

/**
 * Delete tenant (soft delete)
 */
export function useDeleteTenant() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (tenantId: string) => {
      const { error } = await supabase
        .from('tenants')
        .delete()
        .eq('id', tenantId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-tenants'] });
      toast({
        title: 'Tenant Deleted',
        description: 'Tenant has been permanently deleted.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error Deleting Tenant',
        description: getFriendlyError(error),
        variant: 'destructive',
      });
    },
  });
}
