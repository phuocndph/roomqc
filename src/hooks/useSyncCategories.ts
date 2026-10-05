import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'

interface SyncResult {
  categories_created: number
  items_fixed: number
}

export function useSyncCategories() {
  const [isSyncing, setIsSyncing] = useState(false)
  const queryClient = useQueryClient()

  const syncCategories = async (tenantId: string, hotelId: string): Promise<SyncResult | null> => {
    if (!tenantId || !hotelId) {
      console.warn('syncCategories: Missing tenantId or hotelId')
      return null
    }

    setIsSyncing(true)
    try {
      const { data, error } = await supabase.rpc('sync_categories_for_hotel', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
      })

      if (error) {
        console.error('Sync categories error:', error)
        toast({
          title: 'Lỗi đồng bộ',
          description: getFriendlyError(error),
          variant: 'destructive',
        })
        return null
      }

      const result = data as unknown as SyncResult

      // Invalidate relevant queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['item-categories'] }),
      ])

      if (result.categories_created > 0 || result.items_fixed > 0) {
        toast({
          title: 'Đồng bộ hoàn tất',
          description: `Tạo ${result.categories_created} danh mục, sửa ${result.items_fixed} tài sản`,
        })
      }

      return result
    } catch (err: any) {
      console.error('Sync categories exception:', err)
      toast({
        title: 'Lỗi đồng bộ',
        description: getFriendlyError(err),
        variant: 'destructive',
      })
      return null
    } finally {
      setIsSyncing(false)
    }
  }

  return { syncCategories, isSyncing }
}
