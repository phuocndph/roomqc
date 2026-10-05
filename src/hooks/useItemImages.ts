import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export interface ItemImage {
  id: string
  item_id: string
  tenant_id: string
  url: string
  file_name: string | null
  file_size: number | null
  mime_type: string
  is_primary: boolean
  display_order: number
  created_at: string
}

export const useItemImages = (itemId: string | undefined) => {
  return useQuery({
    queryKey: ['item-images', itemId],
    queryFn: async () => {
      if (!itemId) return []

      const { data, error } = await supabase
        .from('item_images')
        .select('*')
        .eq('item_id', itemId)
        .order('display_order')

      if (error) throw error
      return data as ItemImage[]
    },
    enabled: !!itemId,
  })
}

export const useAddItemImage = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      itemId,
      tenantId,
      url,
      isPrimary,
    }: {
      itemId: string
      tenantId: string
      url: string
      isPrimary?: boolean
    }) => {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error('Not authenticated')

      // Get current image count for display order
      const { count } = await supabase
        .from('item_images')
        .select('*', { count: 'exact', head: true })
        .eq('item_id', itemId)

      const { data, error } = await supabase
        .from('item_images')
        .insert({
          item_id: itemId,
          tenant_id: tenantId,
          url: url,
          is_primary: isPrimary || count === 0,
          display_order: count || 0,
          created_by: user.user.id,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['item-images', variables.itemId] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['item', variables.itemId] })
    },
  })
}

export const useDeleteItemImage = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (imageId: string) => {
      const { error } = await supabase
        .from('item_images')
        .delete()
        .eq('id', imageId)

      if (error) throw error
    },
    onSuccess: (_, imageId) => {
      queryClient.invalidateQueries({ queryKey: ['item-images'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Đã xóa ảnh')
    },
    onError: (error) => {
      console.error('Delete image error:', error)
      toast.error('Lỗi khi xóa ảnh')
    },
  })
}

export const useSetPrimaryImage = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ imageId, itemId }: { imageId: string; itemId: string }) => {
      const { error } = await supabase
        .from('item_images')
        .update({ is_primary: true })
        .eq('id', imageId)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['item-images', variables.itemId] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['item', variables.itemId] })
      toast.success('Đã đặt làm ảnh chính')
    },
    onError: (error) => {
      console.error('Set primary error:', error)
      toast.error('Lỗi khi đặt ảnh chính')
    },
  })
}
