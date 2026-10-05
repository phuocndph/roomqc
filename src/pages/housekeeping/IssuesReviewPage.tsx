import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { format } from 'date-fns'

type Row = {
  id: string
  tenant_id: string
  hotel_id: string
  room_id: string
  room_check_id: string
  bucket: string
  asset_group: string | null
  item_name: string | null
  quantity: number
  notes: string | null
  charge_to_guest: boolean | null
  needs_review: boolean
  review_decision: string | null
  created_at: string
  photos: string[] | null
  room?: { room_number: string | null } | null
}

const BUCKET_LABEL: Record<string, string> = {
  items_lost: 'Mất',
  items_damaged: 'Hỏng',
  items_consumed: 'Tiêu hao',
  items_replaced: 'Cần bổ sung',
  items_sent_to_laundry: 'Gửi giặt',
}

export default function IssuesReviewPage() {
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeRow, setActiveRow] = useState<Row | null>(null)
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null)
  const [reason, setReason] = useState('')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['issues-review', tenantId, selectedHotel?.id],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from('room_check_issues')
        .select(`
          id, tenant_id, hotel_id, room_id, room_check_id, bucket, asset_group,
          item_name, quantity, notes, charge_to_guest, needs_review, review_decision,
          created_at, photos,
          room:rooms!room_check_issues_room_id_fkey(room_number)
        `)
        .eq('tenant_id', tenantId!)
        .eq('needs_review', true)
        .is('review_decision', null)
        .order('created_at', { ascending: false })
        .limit(500)
      if (selectedHotel?.id) q = q.eq('hotel_id', selectedHotel.id)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as Row[]
    },
  })

  useEffect(() => {
    if (!tenantId) return
    const ch = supabase
      .channel('issues-review-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_check_issues' }, () => {
        qc.invalidateQueries({ queryKey: ['issues-review'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tenantId, qc])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(r =>
      (r.item_name ?? '').toLowerCase().includes(s) ||
      (r.room?.room_number ?? '').toLowerCase().includes(s) ||
      (r.notes ?? '').toLowerCase().includes(s)
    )
  }, [rows, search])

  const reviewMut = useMutation({
    mutationFn: async ({ id, dec, rs }: { id: string; dec: 'approved' | 'rejected'; rs: string | null }) => {
      const { data, error } = await supabase.rpc('review_room_check_issue', {
        p_issue_id: id, p_decision: dec, p_reason: rs,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.dec === 'approved' ? 'Đã duyệt' : 'Đã từ chối')
      setActiveRow(null); setDecision(null); setReason('')
      qc.invalidateQueries({ queryKey: ['issues-review'] })
    },
    onError: (e: any) => toast.error('Lỗi: ' + e.message),
  })

  const openDecision = (row: Row, dec: 'approved' | 'rejected') => {
    setActiveRow(row); setDecision(dec); setReason('')
  }

  const confirm = () => {
    if (!activeRow || !decision) return
    if (decision === 'rejected' && reason.trim().length < 3) {
      toast.error('Vui lòng nhập lý do từ chối'); return
    }
    reviewMut.mutate({ id: activeRow.id, dec: decision, rs: reason.trim() || null })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b">
        <h1 className="text-xl font-bold">Sự cố chờ duyệt</h1>
        <p className="text-[11px] text-muted-foreground">
          Duyệt các báo cáo từ kiểm tra phòng cần Manager xác nhận trước khi ghi sổ.
        </p>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20">
        <Input
          placeholder="Tìm phòng / item / ghi chú"
          className="h-8 max-w-xs text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="ml-auto text-xs text-muted-foreground">{filtered.length} sự cố</div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Không có sự cố nào chờ duyệt.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((r) => (
              <div key={r.id} className="px-4 py-3 hover:bg-muted/30">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs px-1.5 py-0.5 border rounded">
                        {r.room?.room_number ?? '—'}
                      </span>
                      <span className="text-xs text-amber-600">{BUCKET_LABEL[r.bucket] ?? r.bucket}</span>
                      <span className="font-medium truncate">{r.item_name ?? 'Không rõ'}</span>
                      <span className="text-xs text-muted-foreground">SL {r.quantity}</span>
                      {r.charge_to_guest && (
                        <span className="text-[10px] text-red-600">Đề xuất tính phí</span>
                      )}
                    </div>
                    {r.notes && <div className="text-xs text-muted-foreground mt-1">{r.notes}</div>}
                    {r.photos && r.photos.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {r.photos.slice(0, 4).map((p, i) => (
                          <a key={i} href={p} target="_blank" rel="noreferrer">
                            <img src={p} alt="" className="w-12 h-12 object-cover rounded border" />
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(r.created_at), 'HH:mm dd/MM')}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      size="sm" className="h-8 text-xs"
                      onClick={() => openDecision(r, 'approved')}
                    >Duyệt</Button>
                    <Button
                      size="sm" variant="outline"
                      className="h-8 text-xs text-red-600 hover:text-red-700"
                      onClick={() => openDecision(r, 'rejected')}
                    >Từ chối</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!activeRow} onOpenChange={(o) => { if (!o) { setActiveRow(null); setDecision(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === 'approved' ? 'Duyệt sự cố' : 'Từ chối sự cố'}
            </DialogTitle>
            <DialogDescription>
              {activeRow && (
                <>
                  Phòng <b>{activeRow.room?.room_number}</b> — {activeRow.item_name} (SL {activeRow.quantity})
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={decision === 'approved' ? 'Ghi chú (tùy chọn)' : 'Lý do từ chối (bắt buộc)'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveRow(null)}>Hủy</Button>
            <Button
              variant={decision === 'rejected' ? 'destructive' : 'default'}
              disabled={reviewMut.isPending}
              onClick={confirm}
            >
              {decision === 'approved' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
