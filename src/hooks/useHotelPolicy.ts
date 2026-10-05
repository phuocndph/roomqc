import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from '@/hooks/use-toast'

export interface HotelPolicy {
  id: string
  tenant_id: string
  hotel_id: string
  policy_key: string
  policy_value: any
  version: number
  is_active: boolean
  description: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface HotelPolicyHistory {
  id: string
  policy_id: string | null
  tenant_id: string
  hotel_id: string
  policy_key: string
  old_value: any
  new_value: any
  old_version: number | null
  new_version: number | null
  changed_by: string | null
  changed_role: string | null
  change_reason: string | null
  changed_at: string
}

export const POLICY_KEY_LABELS: Record<string, string> = {
  minibar_expiry_warning_days: 'Cảnh báo minibar hết hạn (ngày)',
  laundry_compensation_after_days: 'Đền bù lô giặt sau (ngày)',
  quick_path_undo_ttl_minutes: 'Thời gian hoàn tác Quick Path (phút)',
  draft_ttl_hours: 'Thời gian giữ bản nháp (giờ)',
  photo_required_by_issue_type: 'Yêu cầu chụp ảnh theo loại sự cố',
  charge_policy_by_asset_group: 'Chính sách tính tiền theo nhóm tài sản',
  max_wash_cycles_by_linen_category: 'Số lần giặt tối đa theo loại đồ vải',
  minibar_fo_reject_notify_manager: 'Báo Quản lý khi Lễ tân từ chối charge minibar',
}

export const useHotelPolicies = () => {
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()

  return useQuery({
    queryKey: ['hotel-policies', tenantId, selectedHotel?.id],
    enabled: !!tenantId && !!selectedHotel?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hotel_policy' as any)
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('hotel_id', selectedHotel!.id)
        .eq('is_active', true)
        .order('policy_key')
      if (error) throw error
      return (data ?? []) as unknown as HotelPolicy[]
    },
  })
}

export const useHotelPolicyHistory = (policyKey?: string) => {
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()

  return useQuery({
    queryKey: ['hotel-policy-history', tenantId, selectedHotel?.id, policyKey],
    enabled: !!tenantId && !!selectedHotel?.id && !!policyKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hotel_policy_history' as any)
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('hotel_id', selectedHotel!.id)
        .eq('policy_key', policyKey!)
        .order('changed_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as unknown as HotelPolicyHistory[]
    },
  })
}

export const useUpdateHotelPolicy = () => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: any }) => {
      const { error } = await supabase
        .from('hotel_policy' as any)
        .update({ policy_value: value })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Đã lưu cấu hình' })
      qc.invalidateQueries({ queryKey: ['hotel-policies'] })
      qc.invalidateQueries({ queryKey: ['hotel-policy-history'] })
    },
    onError: (err: any) => {
      toast({
        title: 'Lưu thất bại',
        description: err?.message ?? 'Có lỗi xảy ra',
        variant: 'destructive',
      })
    },
  })
}
