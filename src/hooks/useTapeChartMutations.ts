/**
 * Tape Chart mutations — Phase 2b
 * 4 RPCs: create_room_block, delete_room_block, move_booking, resize_booking
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { useHotelContext } from '@/contexts/HotelContext'
import type { RoomBlockType } from './useTapeChart'

const ERROR_MAP: Record<string, string> = {
  unauthorized: 'Bạn chưa đăng nhập',
  forbidden_hotel: 'Bạn không có quyền với khách sạn này',
  permission_denied: 'Chỉ Quản lý / Chủ trở lên mới được thao tác',
  room_not_in_hotel: 'Phòng không thuộc khách sạn này',
  booking_not_found: 'Không tìm thấy booking',
  block_not_found: 'Không tìm thấy block',
  booking_locked: 'Booking đã đóng, không thể di chuyển',
  checkin_locked: 'Khách đang lưu trú, không thể đổi ngày nhận',
  conflict_with_booking: 'Khoảng ngày bị trùng với booking khác',
  conflict_with_block: 'Khoảng ngày bị trùng với block đã có',
  invalid_date_range: 'Ngày kết thúc phải sau ngày bắt đầu',
  invalid_block_type: 'Loại block không hợp lệ',
}

function translateError(err: unknown): string {
  const msg = (err as any)?.message || String(err)
  for (const code in ERROR_MAP) {
    if (msg.includes(code)) return ERROR_MAP[code]
  }
  return msg
}

export function useTapeChartMutations() {
  const qc = useQueryClient()
  const { selectedHotel } = useHotelContext()
  const hotelId = selectedHotel?.id

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tape-chart', hotelId] })

  const createBlock = useMutation({
    mutationFn: async (p: {
      room_id: string
      start_date: string
      end_date: string
      block_type: RoomBlockType
      reason?: string
    }) => {
      if (!hotelId) throw new Error('no_hotel')
      const { data, error } = await supabase.rpc('create_room_block' as any, {
        p_hotel_id: hotelId,
        p_room_id: p.room_id,
        p_start_date: p.start_date,
        p_end_date: p.end_date,
        p_block_type: p.block_type,
        p_reason: p.reason || null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Đã chặn phòng')
      invalidate()
    },
    onError: (err) => toast.error(translateError(err)),
  })

  const deleteBlock = useMutation({
    mutationFn: async (block_id: string) => {
      const { data, error } = await supabase.rpc('delete_room_block' as any, {
        p_block_id: block_id,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Đã gỡ block')
      invalidate()
    },
    onError: (err) => toast.error(translateError(err)),
  })

  const moveBooking = useMutation({
    mutationFn: async (p: {
      booking_id: string
      new_room_id: string
      new_check_in: string
      new_check_out: string
    }) => {
      const { data, error } = await supabase.rpc('move_booking' as any, {
        p_booking_id: p.booking_id,
        p_new_room_id: p.new_room_id,
        p_new_check_in: p.new_check_in,
        p_new_check_out: p.new_check_out,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Đã chuyển booking')
      invalidate()
    },
    onError: (err) => toast.error(translateError(err)),
  })

  const resizeBooking = useMutation({
    mutationFn: async (p: {
      booking_id: string
      new_check_in: string
      new_check_out: string
    }) => {
      const { data, error } = await supabase.rpc('resize_booking' as any, {
        p_booking_id: p.booking_id,
        p_new_check_in: p.new_check_in,
        p_new_check_out: p.new_check_out,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Đã đổi ngày booking')
      invalidate()
    },
    onError: (err) => toast.error(translateError(err)),
  })

  return { createBlock, deleteBlock, moveBooking, resizeBooking }
}
