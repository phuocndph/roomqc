import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/hooks/use-toast'
import { triggerWorkflow } from '@/lib/triggerWorkflow'
import { useUser } from './useUser'
import { useAuth } from '@/contexts/AuthContext'
import { getFriendlyError } from '@/lib/errorMessage'

interface SetupRoomResult {
  success: boolean
  added: number
  updated: number
  deleted: number
  message: string
  error?: string
}

export function useSetupRoom() {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ 
      roomId, 
      reset = false 
    }: { 
      roomId: string
      reset?: boolean 
    }) => {
      // Get room info for workflow trigger
      const { data: room } = await supabase
        .from('rooms')
        .select('room_number, hotel_id')
        .eq('id', roomId)
        .single()

      const { data, error } = await supabase
        .rpc('setup_room_initial', {
          p_room_id: roomId,
          p_user_id: user?.id ?? null,
          p_reset_quantities: reset
        })

      if (error) throw error
      
      const result = data as unknown as SetupRoomResult

      // Trigger workflow for room standards applied
      if (result.success && tenantId && room) {
        await triggerWorkflow({
          triggerType: 'room_standards_applied',
          eventData: {
            room_id: roomId,
            room_number: room.room_number,
            items_added: result.added,
            items_updated: result.updated,
            items_deleted: result.deleted,
            reset_mode: reset,
          },
          tenantId,
          hotelId: room.hotel_id,
        }).catch(err => console.error('Workflow trigger failed:', err))
      }

      return result
    },
    onSuccess: (result, { roomId }) => {
      queryClient.invalidateQueries({ queryKey: ['room', roomId] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['room-supplements', roomId] })
      
      if (result.success) {
        toast({
          title: 'Thành công',
          description: result.message,
        })
      } else {
        toast({
          title: 'Lỗi',
          description: result.error || 'Không thể setup phòng',
          variant: 'destructive',
        })
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi setup phòng',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}
