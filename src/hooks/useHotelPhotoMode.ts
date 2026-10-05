import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { mapDbError } from '@/lib/dbErrors'

export type PhotoEvidenceMode = 'none' | 'on_issue' | 'always'

export const PHOTO_MODE_LABELS: Record<PhotoEvidenceMode, string> = {
  none: 'Không bắt buộc',
  on_issue: 'Bắt buộc khi có sự cố',
  always: 'Luôn bắt buộc',
}

export const PHOTO_MODE_DESC: Record<PhotoEvidenceMode, string> = {
  none: 'Nhân viên không cần chụp ảnh khi kiểm phòng. Phù hợp khách sạn mini.',
  on_issue: 'Phải có ít nhất 1 ảnh khi báo lỗi (mất, hỏng, bẩn). Khuyến nghị cho 3 sao.',
  always: 'Mọi lần kiểm đều phải chụp ảnh, kể cả phòng OK. Phù hợp 4 sao.',
}

/** Lấy photo_evidence_mode hiện tại của hotel. */
export function useHotelPhotoMode(hotelId?: string | null) {
  return useQuery({
    queryKey: ['hotel-photo-mode', hotelId],
    enabled: !!hotelId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PhotoEvidenceMode> => {
      const { data, error } = await supabase
        .from('hotels')
        .select('photo_evidence_mode')
        .eq('id', hotelId!)
        .maybeSingle()
      if (error) throw error
      return ((data as any)?.photo_evidence_mode ?? 'none') as PhotoEvidenceMode
    },
  })
}

export function useUpdateHotelPhotoMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ hotelId, mode }: { hotelId: string; mode: PhotoEvidenceMode }) => {
      const { error } = await supabase
        .from('hotels')
        .update({ photo_evidence_mode: mode } as any)
        .eq('id', hotelId)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['hotel-photo-mode', vars.hotelId] })
      qc.invalidateQueries({ queryKey: ['hotels'] })
      toast.success('Đã cập nhật yêu cầu ảnh bằng chứng')
    },
    onError: (err: any) => toast.error(mapDbError(err?.message ?? err)),
  })
}
