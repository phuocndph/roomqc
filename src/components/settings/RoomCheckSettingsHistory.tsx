import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { History, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Skeleton } from '@/components/ui/skeleton'

interface SettingsLogRow {
  id: string
  created_at: string
  user_name: string | null
  user_role: string | null
  description: string | null
  old_values: any
  new_values: any
  entity_id: string | null
}

const KEY_LABELS: Record<string, string> = {
  use_lean: 'Dùng giao diện Lean',
  quick_path_enabled: 'Bật Quick Path',
  quick_path_rate_limit_minutes: 'Giới hạn Quick Path (phút)',
  photo_required_damaged_lost: 'Bắt buộc ảnh: Hỏng/Mất',
  photo_required_missing_replace: 'Bắt buộc ảnh: Thiếu/Bổ sung',
  photo_required_consumed_chargeable: 'Bắt buộc ảnh: Tiêu hao tính phí',
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Bật' : 'Tắt'
  return String(v)
}

function parseJson(v: any): Record<string, unknown> {
  if (!v) return {}
  if (typeof v === 'string') {
    try { return JSON.parse(v) } catch { return {} }
  }
  return v as Record<string, unknown>
}

export function RoomCheckSettingsHistory({ hotelId }: { hotelId: string | null }) {
  const { tenantId } = useUser()
  const [open, setOpen] = useState(true)

  const { data, isLoading } = useQuery({
    queryKey: ['room-check-settings-history', tenantId, hotelId],
    queryFn: async () => {
      if (!tenantId || !hotelId) return [] as SettingsLogRow[]
      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, created_at, user_name, user_role, description, old_values, new_values, entity_id')
        .eq('tenant_id', tenantId)
        .eq('entity_type', 'hotel_room_check_settings')
        .eq('entity_id', hotelId)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as SettingsLogRow[]
    },
    enabled: !!tenantId && !!hotelId,
  })

  if (!hotelId) return null

  return (
    <div className="border rounded-lg bg-background">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Lịch sử thay đổi cấu hình</span>
        {data && data.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{data.length} bản ghi</span>
        )}
      </button>

      {open && (
        <div className="border-t">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Chưa có thay đổi nào được ghi nhận.
            </div>
          ) : (
            <div className="divide-y max-h-96 overflow-auto">
              {data.map((row) => {
                const oldV = parseJson(row.old_values)
                const newV = parseJson(row.new_values)
                const keys = Array.from(new Set([...Object.keys(oldV), ...Object.keys(newV)]))
                return (
                  <div key={row.id} className="p-3 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-medium">{row.user_name || 'Hệ thống'}</span>
                      {row.user_role && (
                        <span className="text-muted-foreground">({row.user_role})</span>
                      )}
                      <span className="text-muted-foreground ml-auto">
                        {format(new Date(row.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {keys.map((k) => (
                        <div key={k} className="text-xs flex items-center gap-2 flex-wrap">
                          <span className="text-muted-foreground">{KEY_LABELS[k] ?? k}:</span>
                          <span className="text-red-600 line-through">{formatVal(oldV[k])}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-green-600 font-medium">{formatVal(newV[k])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
