import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyError } from '@/lib/errorMessage'
import { defaultTenantDirectoryRequest, readTenantDirectory, tenantDirectoryArguments, type TenantDirectoryRequest } from '@/lib/admin-tenant-directory';

/**
 * Every list filter, count and page is evaluated by the live-admin server RPC.
 */
export function useTenants(request: TenantDirectoryRequest = defaultTenantDirectoryRequest) {
  const args = tenantDirectoryArguments(request);
  return useQuery({
    queryKey: ['super-admin-tenants', args],
    queryFn: async () => {
      // Narrow cast until generated Database types include the new migration.
      const { data, error } = await supabase.rpc('admin_tenant_directory_page' as never, args as never);
      if (error) throw error;
      return readTenantDirectory(data);
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
    mutationFn: async ({ tenantId, reason }: { tenantId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('admin_manage_tenant', {
        p_tenant_id: tenantId, p_action: 'suspend', p_reason: reason,
      });

      if (error) throw error;
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.id !== tenantId) {
        throw new Error('Máy chủ chưa xác nhận thay đổi. Vui lòng tải lại trước khi thử lại.');
      }
      return data;
    },
    onSuccess: () => {
      for (const key of ['super-admin-tenants','super-admin-tenant','tenant-subscription','tenant-read-only','tenant','tenant-usage','check-quota']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast({
        title: 'Tenant Suspended',
        description: 'Tenant has been suspended successfully.',
      });
    },
    onError: (error: unknown) => {
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
    mutationFn: async ({ tenantId, reason }: { tenantId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('admin_manage_tenant', {
        p_tenant_id: tenantId, p_action: 'reactivate', p_reason: reason,
      });

      if (error) throw error;
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.id !== tenantId) {
        throw new Error('Máy chủ chưa xác nhận thay đổi. Vui lòng tải lại trước khi thử lại.');
      }
      return data;
    },
    onSuccess: () => {
      for (const key of ['super-admin-tenants','super-admin-tenant','tenant-subscription','tenant-read-only','tenant','tenant-usage','check-quota']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast({
        title: 'Tenant Reactivated',
        description: 'Tenant has been reactivated successfully.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error Reactivating Tenant',
        description: getFriendlyError(error),
        variant: 'destructive',
      });
    },
  });
}
