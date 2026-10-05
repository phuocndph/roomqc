import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Vendor, VendorFilters, VendorStats } from '@/types/vendor.types';
import { useToast } from './use-toast';
import { useUser } from './useUser';
import { getFriendlyError } from '@/lib/errorMessage'

export function useVendors(filters?: VendorFilters) {
  const { tenantId } = useUser();

  return useQuery({
    queryKey: ['vendors', tenantId, filters],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant');

      let queryBuilder: any = supabase
        .from('vendors')
        .select('*')
        .eq('tenant_id', tenantId);

      if (filters?.search) {
        queryBuilder = queryBuilder.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`);
      }

      if (filters?.category && filters.category !== 'all') {
        queryBuilder = queryBuilder.eq('category', filters.category);
      }

      if (filters?.status && filters.status !== 'all') {
        queryBuilder = queryBuilder.eq('status', filters.status);
      }

      if (filters?.min_rating) {
        queryBuilder = queryBuilder.gte('rating', filters.min_rating);
      }

      const { data, error } = await queryBuilder.order(filters?.sort_by || 'name', { 
        ascending: filters?.sort_order === 'asc' 
      });
      
      if (error) throw error;
      return data as Vendor[];
    },
    enabled: !!tenantId,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useVendor(id: string) {
  return useQuery({
    queryKey: ['vendor', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as Vendor;
    },
    enabled: !!id,
  });
}

export function useVendorStats() {
  const { tenantId } = useUser();

  return useQuery({
    queryKey: ['vendor-stats', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant');

      const firstDayOfMonth = new Date();
      firstDayOfMonth.setDate(1);
      firstDayOfMonth.setHours(0, 0, 0, 0);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get vendor counts
      const { count: totalVendors } = await supabase
        .from('vendors')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      const { count: activeVendors } = await supabase
        .from('vendors')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'active');

      const { count: newThisMonth } = await supabase
        .from('vendors')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', firstDayOfMonth.toISOString());

      // Get average rating
      const { data: vendorsWithRating } = await supabase
        .from('vendors')
        .select('rating')
        .eq('tenant_id', tenantId)
        .gt('rating', 0);

      const averageRating = vendorsWithRating && vendorsWithRating.length > 0
        ? vendorsWithRating.reduce((sum, v) => sum + (v.rating || 0), 0) / vendorsWithRating.length
        : 0;

      // Get PO stats for last 30 days
      const { data: recentPOs } = await supabase
        .from('purchase_orders')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .gte('order_date', thirtyDaysAgo.toISOString());

      const totalOrders30d = recentPOs?.length || 0;
      const totalValue30d = recentPOs?.reduce((sum, po) => sum + (po.total_amount || 0), 0) || 0;

      const stats: VendorStats = {
        total_vendors: totalVendors || 0,
        active_vendors: activeVendors || 0,
        new_this_month: newThisMonth || 0,
        average_rating: Math.round(averageRating * 10) / 10,
        total_orders_30d: totalOrders30d,
        total_value_30d: totalValue30d
      };
      
      return stats;
    },
    enabled: !!tenantId,
  });
}

export function useCreateVendor() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (vendor: Omit<Vendor, 'id' | 'created_at' | 'updated_at' | 'code'>) => {
      const { data, error } = await supabase
        .from('vendors')
        .insert([vendor as any])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: 'Thành công',
        description: 'Đã thêm nhà cung cấp mới',
      });
    },
  });
}

export function useUpdateVendor() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...vendor }: Partial<Vendor> & { id: string }) => {
      const { data, error } = await supabase
        .from('vendors')
        .update(vendor)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendor', variables.id] });
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật thông tin nhà cung cấp',
      });
    },
  });
}

export function useVendorPOs(vendorId: string) {
  return useQuery({
    queryKey: ['vendor-pos', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('order_date', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!vendorId,
  });
}

export function useDeleteVendor() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  return useMutation({
    mutationFn: async (vendorId: string) => {
      // Check if vendor has active purchase orders
      const { count } = await supabase
        .from('purchase_orders')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId)
        .in('status', ['submitted', 'approved', 'ordered', 'partial'])
      
      if (count && count > 0) {
        throw new Error('Không thể xóa nhà cung cấp có đơn hàng đang xử lý')
      }
      
      const { error } = await supabase
        .from('vendors')
        .delete()
        .eq('id', vendorId)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      toast({
        title: 'Thành công',
        description: 'Đã xóa nhà cung cấp',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}
