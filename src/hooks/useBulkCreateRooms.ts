import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from 'sonner'

interface RoomImportData {
  room_number: string
  floor: number
  room_type: string
  status?: string
  bed_type?: string
  max_guests?: number
  area_sqm?: number
  base_price?: number
  amenities?: string[]
  has_balcony?: boolean
  has_window?: boolean
  smoking_allowed?: boolean
  view_type?: string
  notes?: string
}

interface BulkCreateResult {
  success: number
  failed: number
  errors: Array<{ row: number; room_number: string; error: string }>
}

export function useBulkCreateRooms() {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async ({ 
      rooms, 
      hotelId 
    }: { 
      rooms: RoomImportData[]
      hotelId: string 
    }): Promise<BulkCreateResult> => {
      if (!tenantId) throw new Error('No tenant ID')

      // Check quota before importing
      const [{ data: usage }, { data: tenant }] = await Promise.all([
        supabase
          .from('tenant_usage')
          .select('current_rooms_count')
          .eq('tenant_id', tenantId)
          .single(),
        supabase
          .from('tenants')
          .select('subscription_plan_id, subscription_plans:subscription_plan_id(max_rooms)')
          .eq('id', tenantId)
          .single()
      ])

      const currentRooms = usage?.current_rooms_count || 0
      const maxRooms = (tenant?.subscription_plans as any)?.max_rooms
      
      if (maxRooms !== null && maxRooms !== undefined) {
        const remainingSlots = maxRooms - currentRooms
        if (rooms.length > remainingSlots) {
          throw new Error(
            `Vượt quá giới hạn gói dịch vụ. Hiện tại: ${currentRooms}/${maxRooms} phòng, chỉ có thể thêm ${remainingSlots} phòng nữa nhưng đang import ${rooms.length} phòng.`
          )
        }
      }

      const result: BulkCreateResult = {
        success: 0,
        failed: 0,
        errors: []
      }

      // Process rooms in batches of 10
      const batchSize = 10
      for (let i = 0; i < rooms.length; i += batchSize) {
        const batch = rooms.slice(i, i + batchSize)
        
        for (let j = 0; j < batch.length; j++) {
          const room = batch[j]
          const rowNumber = i + j + 2 // +2 for Excel row (header + 0-index)

          try {
            // Check if room already exists
            const { data: existing } = await supabase
              .from('rooms')
              .select('id')
              .eq('hotel_id', hotelId)
              .eq('room_number', room.room_number)
              .single()

            if (existing) {
              result.failed++
              result.errors.push({
                row: rowNumber,
                room_number: room.room_number,
                error: 'Phòng đã tồn tại trong khách sạn này'
              })
              continue
            }

            // Insert room
            const { error } = await supabase
              .from('rooms')
              .insert({
                tenant_id: tenantId,
                hotel_id: hotelId,
                room_number: room.room_number,
                floor: room.floor,
                room_type: room.room_type,
                status: room.status || 'vacant',
                bed_type: room.bed_type,
                max_guests: room.max_guests,
                area_sqm: room.area_sqm,
                base_price: room.base_price,
                amenities: room.amenities || [],
                has_balcony: room.has_balcony || false,
                has_window: room.has_window !== false,
                smoking_allowed: room.smoking_allowed || false,
                view_type: room.view_type,
                notes: room.notes
              })

            if (error) throw error
            
            result.success++
          } catch (error: any) {
            result.failed++
            result.errors.push({
              row: rowNumber,
              room_number: room.room_number,
              error: error.message || 'Lỗi không xác định'
            })
          }
        }
      }

      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['room-stats'] })
      queryClient.invalidateQueries({ queryKey: ['floor-plan'] })
      
      if (result.failed === 0) {
        toast.success(`Đã import thành công ${result.success} phòng`)
      } else {
        toast.warning(
          `Hoàn thành: ${result.success} thành công, ${result.failed} thất bại`
        )
      }
    },
    onError: (error: Error) => {
      toast.error(`Lỗi import: ${error.message}`)
    }
  })
}
