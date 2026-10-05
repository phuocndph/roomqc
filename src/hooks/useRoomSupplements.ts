import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from 'sonner'
import type { RoomItemWithDetails } from '@/types/rooms.types'
import { getFriendlyError } from '@/lib/errorMessage'

export interface SupplementItem {
  item_id: string
  item_name: string
  item_code: string
  item_thumbnail?: string
  category_name?: string
  standard_quantity: number
  current_quantity: number
  missing_quantity: number
  quantity_in_stock: number
  unit_price: number
  selected_quantity: number
  item_type: string
}

export interface RoomSupplementData {
  room_id: string
  room_number: string
  room_type: string
  hotel_id: string
  missing_items: SupplementItem[]
  consumable_items: SupplementItem[]
  total_missing_value: number
}

/**
 * Hook to calculate items needed for room supplement
 * Returns missing standard items and available consumables for refill
 */
export function useRoomSupplements(roomId: string | undefined) {
  return useQuery({
    queryKey: ['room-supplements', roomId],
    queryFn: async (): Promise<RoomSupplementData | null> => {
      if (!roomId) return null

      // Fetch room info
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('id, room_number, room_type, hotel_id')
        .eq('id', roomId)
        .single()

      if (roomError) throw roomError

      // Fetch room items with standards comparison
      const { data: roomItems, error: itemsError } = await supabase
        .rpc('get_room_items_with_standards', { p_room_id: roomId })

      if (itemsError) throw itemsError

      // Fetch stock info for missing items
      const missingItems: SupplementItem[] = []
      const consumableItems: SupplementItem[] = []

      for (const item of (roomItems || [])) {
        // Get stock info
        const { data: stockItem } = await supabase
          .from('items')
          .select('quantity_in_stock, unit_price, item_type')
          .eq('id', item.item_id)
          .single()

        // Calculate derived fields from RPC response
        const currentQuantity = item.quantity || 0
        const standardQuantity = item.standard_quantity || 0
        const missingQuantity = Math.max(0, standardQuantity - currentQuantity)
        const hasStandard = standardQuantity > 0

        const supplementItem: SupplementItem = {
          item_id: item.item_id,
          item_name: item.item_name,
          item_code: item.item_code,
          item_thumbnail: undefined, // Not returned by RPC
          category_name: item.category_name,
          standard_quantity: standardQuantity,
          current_quantity: currentQuantity,
          missing_quantity: missingQuantity,
          quantity_in_stock: stockItem?.quantity_in_stock || 0,
          unit_price: stockItem?.unit_price || 0,
          selected_quantity: missingQuantity, // Default to missing qty
          item_type: item.item_type || stockItem?.item_type || 'equipment',
        }

        // Add to missing if has standard and missing > 0
        if (hasStandard && missingQuantity > 0) {
          missingItems.push(supplementItem)
        }

        // Add consumables that might need refill (even if not missing)
        if ((item.item_type || stockItem?.item_type) === 'consumable' && hasStandard) {
          consumableItems.push({
            ...supplementItem,
            selected_quantity: 0, // Default to 0 for extra consumables
          })
        }
      }

      const totalMissingValue = missingItems.reduce(
        (sum, item) => sum + (item.missing_quantity * item.unit_price),
        0
      )

      return {
        room_id: room.id,
        room_number: room.room_number,
        room_type: room.room_type,
        hotel_id: room.hotel_id,
        missing_items: missingItems,
        consumable_items: consumableItems.filter(
          c => !missingItems.some(m => m.item_id === c.item_id)
        ),
        total_missing_value: totalMissingValue,
      }
    },
    enabled: !!roomId,
  })
}

/**
 * Mutation to create supplement outbound transaction for a room
 * Uses the standard create_outbound_transaction RPC for consistency
 */
export function useCreateRoomSupplement() {
  const { tenantId, user } = useUser()
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      room_id: string
      room_number: string
      items: { item_id: string; quantity: number; unit_price?: number }[]
      notes?: string
    }) => {
      if (!tenantId || !user?.id || !selectedHotel?.id) {
        throw new Error('Missing required context')
      }

      // Filter out items with 0 quantity
      const validItems = data.items.filter(item => item.quantity > 0)
      
      if (validItems.length === 0) {
        throw new Error('Không có item nào để bổ sung')
      }

      // Validate stock availability before proceeding
      for (const item of validItems) {
        const { data: stockItem, error: stockError } = await supabase
          .from('items')
          .select('quantity_in_stock, name')
          .eq('id', item.item_id)
          .single()
        
        if (stockError) {
          console.error('Error checking stock:', stockError)
          continue
        }
        
        const availableStock = stockItem?.quantity_in_stock || 0
        if (item.quantity > availableStock) {
          throw new Error(`${stockItem?.name || 'Item'} chỉ còn ${availableStock} trong kho, không đủ ${item.quantity}`)
        }
      }

      // Format items for RPC
      const rpcItems = validItems.map(item => ({
        item_id: item.item_id,
        quantity: item.quantity,
        unit_price: item.unit_price || 0,
      }))

      // Use the standard create_outbound_transaction RPC
      const { data: result, error } = await supabase.rpc('create_outbound_transaction', {
        p_tenant_id: tenantId,
        p_hotel_id: selectedHotel.id,
         // Legacy room_assign is rejected by the database. Keep the room
         // linkage in related_type/related_id while using a valid category.
         p_transaction_category: 'other_out',
        p_from_location: 'Kho',
        p_to_location: `Phòng ${data.room_number}`,
        p_created_by: user.id,
        p_items: rpcItems as any,
        p_related_type: 'room',
        p_related_id: data.room_id,
        p_recipient_name: null,
        p_recipient_signature: null,
        p_documents: null,
        p_photos: null,
        p_notes: data.notes || `Bổ sung đồ dùng cho phòng ${data.room_number}`,
        p_from_warehouse_id: null,
      })

      if (error) throw error

      const response = result as unknown as {
        success: boolean
        error?: string
        total_items?: number
        total_value?: number
        low_stock_items?: string[]
        transaction_code?: string
      }

      if (!response.success) {
        throw new Error(response.error || 'Failed to create transaction')
      }

      // After successful transaction, update room_items
      for (const item of validItems) {
        const { data: existingRoomItem } = await supabase
          .from('room_items')
          .select('id, quantity')
          .eq('room_id', data.room_id)
          .eq('item_id', item.item_id)
          .single()

        if (existingRoomItem) {
          await supabase
            .from('room_items')
            .update({
              quantity: (existingRoomItem.quantity || 0) + item.quantity,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingRoomItem.id)
        } else {
          // room_items has no tenant_id column (tenant enforced via room_id + RLS)
          await supabase
            .from('room_items')
            .insert({
              room_id: data.room_id,
              item_id: item.item_id,
              quantity: item.quantity,
            })
        }

      }

      return {
        ...response,
        total_items: validItems.length,
        total_quantity: validItems.reduce((sum, i) => sum + i.quantity, 0),
      }
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room', variables.room_id] })
      queryClient.invalidateQueries({ queryKey: ['room-supplements', variables.room_id] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock-items'] })
      queryClient.invalidateQueries({ queryKey: ['room-items'] })
      
      toast.success(`Đã bổ sung ${result.total_quantity} đồ dùng`, {
        description: `Phòng ${variables.room_number}${result.transaction_code ? ` - Mã: ${result.transaction_code}` : ''}`,
      })
      
      if (result.low_stock_items && result.low_stock_items.length > 0) {
        toast.warning('Cảnh báo tồn kho thấp', {
          description: `${result.low_stock_items.join(', ')} đã xuống dưới mức tối thiểu`,
        })
      }
    },
    onError: (error: Error) => {
      toast.error('Lỗi bổ sung đồ dùng', {
        description: getFriendlyError(error),
      })
    },
  })
}

/**
 * Hook to get rooms that need supplements (missing items)
 */
export function useRoomsNeedingSupplement() {
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()

  return useQuery({
    queryKey: ['rooms-needing-supplement', tenantId, selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId) return []

      const { data, error } = await supabase.rpc('get_rooms_filtered', {
        p_tenant_id: tenantId,
        p_hotel_id: selectedHotel?.id || null,
        p_floor: null,
        p_room_type: null,
        p_status: null,
        p_search: null,
        p_missing_items_only: true,
      })

      if (error) throw error
      return data || []
    },
    enabled: !!tenantId,
  })
}
