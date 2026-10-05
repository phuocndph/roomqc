import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'

export interface ReadOnlyState {
  isReadOnly: boolean
  reason: string | null
  since: string | null
}

/**
 * Đọc cờ chỉ-đọc của tenant hiện tại.
 * Khi `isReadOnly = true`, mọi mutation nhạy cảm sẽ bị DB trigger
 * `enforce_read_only_mutation` chặn với mã `TENANT_READ_ONLY`.
 *
 * UI dùng kết quả này để:
 *  - Hiển thị banner màu vàng giải thích (đặt ở MainLayout)
 *  - Disable các nút Tạo/Sửa/Xóa
 */
export function useReadOnlyMode() {
  const { tenantId } = useUser()

  const query = useQuery<ReadOnlyState>({
    queryKey: ['tenant-read-only', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('is_read_only, read_only_reason, read_only_since')
        .eq('id', tenantId!)
        .maybeSingle()

      if (error) throw error
      return {
        isReadOnly: !!data?.is_read_only,
        reason: data?.read_only_reason ?? null,
        since: data?.read_only_since ?? null,
      }
    },
  })

  return {
    isReadOnly: query.data?.isReadOnly ?? false,
    reason: query.data?.reason ?? null,
    since: query.data?.since ?? null,
    isLoading: query.isLoading,
  }
}
