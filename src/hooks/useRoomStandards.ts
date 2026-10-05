import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useToast } from '@/hooks/use-toast'
import type { RoomType } from '@/types/rooms.types'
import { getFriendlyError } from '@/lib/errorMessage'

export function useRoomStandards(roomType: RoomType) {
  const { hotelId } = useUser()
  
  return useQuery({
    queryKey: ['room-standards', hotelId, roomType],
    queryFn: async () => {
      if (!hotelId) throw new Error('No hotel')
      
      const { data, error } = await supabase
        .rpc('get_room_standards', {
          p_hotel_id: hotelId,
          p_room_type: roomType,
        })
      
      if (error) throw error
      return data
    },
    enabled: !!hotelId,
  })
}

export function useAddStandard() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { tenantId, hotelId } = useUser()
  
  return useMutation({
    mutationFn: async ({
      roomType,
      itemId,
      quantity,
    }: {
      roomType: RoomType
      itemId: string
      quantity: number
    }) => {
      const { data, error } = await supabase
        .from('room_type_standards')
        .insert({
          tenant_id: tenantId,
          hotel_id: hotelId,
          room_type: roomType,
          item_id: itemId,
          quantity,
        })
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room-standards', hotelId, variables.roomType] })
      toast({
        title: 'Thành công',
        description: 'Đã thêm đồ dùng vào chuẩn',
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

export function useUpdateStandard() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { hotelId } = useUser()
  
  return useMutation({
    mutationFn: async ({
      id,
      quantity,
      roomType,
    }: {
      id: string
      quantity: number
      roomType: RoomType
    }) => {
      const { data, error } = await supabase
        .from('room_type_standards')
        .update({ quantity })
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room-standards', hotelId, variables.roomType] })
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật số lượng',
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

export function useDeleteStandard() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { hotelId } = useUser()
  
  return useMutation({
    mutationFn: async ({
      id,
      roomType,
    }: {
      id: string
      roomType: RoomType
    }) => {
      const { error } = await supabase
        .from('room_type_standards')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room-standards', hotelId, variables.roomType] })
      toast({
        title: 'Thành công',
        description: 'Đã xóa đồ dùng khỏi chuẩn',
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

export function useCloneStandards() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { tenantId, hotelId } = useUser()
  
  return useMutation({
    mutationFn: async ({
      sourceRoomType,
      targetRoomType,
    }: {
      sourceRoomType: RoomType
      targetRoomType: RoomType
    }) => {
      // 1. Delete all existing standards for target room type
      const { error: deleteError } = await supabase
        .from('room_type_standards')
        .delete()
        .eq('hotel_id', hotelId)
        .eq('room_type', targetRoomType)
      
      if (deleteError) throw deleteError
      
      // 2. Get all standards from source room type
      const { data: sourceStandards, error: fetchError } = await supabase
        .rpc('get_room_standards', {
          p_hotel_id: hotelId,
          p_room_type: sourceRoomType,
        })
      
      if (fetchError) throw fetchError
      
      if (!sourceStandards || sourceStandards.length === 0) {
        return { count: 0 }
      }
      
      // 3. Insert cloned standards for target room type
      const newStandards = sourceStandards.map((s: any) => ({
        tenant_id: tenantId,
        hotel_id: hotelId,
        room_type: targetRoomType,
        item_id: s.item_id,
        quantity: s.quantity,
      }))
      
      const { error: insertError } = await supabase
        .from('room_type_standards')
        .insert(newStandards)
      
      if (insertError) throw insertError
      
      return { count: sourceStandards.length }
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room-standards', hotelId, variables.targetRoomType] })
      toast({
        title: 'Thành công',
        description: `Đã sao chép ${result.count} tài sản`,
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

export function useApplyStandards() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { user } = useUser()
  
  return useMutation({
    mutationFn: async (roomId: string) => {
      const { data, error } = await supabase
        .rpc('apply_room_standards', {
          p_room_id: roomId,
          p_user_id: user?.id,
        })
      
      if (error) throw error
      return data
    },
    onSuccess: (result: any, roomId) => {
      queryClient.invalidateQueries({ queryKey: ['room', roomId] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      
      toast({
        title: 'Thành công',
        description: `Đã áp dụng chuẩn: ${result.added} thêm mới, ${result.updated} cập nhật`,
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
