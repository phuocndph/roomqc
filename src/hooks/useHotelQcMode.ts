import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { mapDbError } from '@/lib/dbErrors'

export type QcMode = 'self' | 'peer' | 'strict'

export const QC_MODE_LABELS: Record<QcMode, string> = {
  self: 'Tự đóng (Self)',
  peer: 'Đồng nghiệp duyệt (Peer)',
  strict: 'Chỉ quản lý (Strict)',
}

export const QC_MODE_DESC: Record<QcMode, string> = {
  self: 'Nhân viên hoàn tất → đóng phiếu ngay. Phù hợp khách sạn mini.',
  peer: 'Nhân viên hoàn tất → đồng nghiệp có quyền QC duyệt (không tự duyệt mình).',
  strict: 'Chỉ quản lý / chủ khách sạn được duyệt cuối cùng. Phù hợp 4 sao.',
}

/** Lấy qc_mode hiện tại của hotel. */
export function useHotelQcMode(hotelId?: string | null) {
  return useQuery({
    queryKey: ['hotel-qc-mode', hotelId],
    enabled: !!hotelId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<QcMode> => {
      const { data, error } = await supabase
        .from('hotels')
        .select('qc_mode')
        .eq('id', hotelId!)
        .maybeSingle()
      if (error) throw error
      return ((data as any)?.qc_mode ?? 'self') as QcMode
    },
  })
}

export function useUpdateHotelQcMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ hotelId, mode }: { hotelId: string; mode: QcMode }) => {
      const { error } = await supabase
        .from('hotels')
        .update({ qc_mode: mode } as any)
        .eq('id', hotelId)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['hotel-qc-mode', vars.hotelId] })
      qc.invalidateQueries({ queryKey: ['hotels'] })
      toast.success('Đã cập nhật chế độ QC')
    },
    onError: (err: any) => toast.error(mapDbError(err?.message ?? err)),
  })
}
