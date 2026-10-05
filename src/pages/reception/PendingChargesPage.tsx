import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'

type Row = {
  id: string
  booking_id: string
  room_id: string
  item_name: string
  item_code: string | null
  quantity: number
  unit_price: number
  total_amount: number | null
  notes: string | null
  recorded_at: string
  approval_status: 'pending' | 'approved' | 'rejected'
  reviewed_at: string | null
  reject_reason: string | null
  room: { room_number: string | null } | null
  booking: { booking_number: string | null; guest_name: string | null } | null
}

export default function PendingChargesPage() {
  const { tenantId, role } = useUser()
  const { selectedHotel } = useHotelContext()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [overrideRow, setOverrideRow] = useState<Row | null>(null)
  const [overrideDecision, setOverrideDecision] = useState<'approved' | 'rejected'>('approved')
  const [overrideReason, setOverrideReason] = useState('')
  const isManager = ['super_admin','owner','hotel_manager','department_manager'].includes(role ?? '')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['pending-charges', tenantId, selectedHotel?.id, statusFilter],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from('chargeable_consumptions')
        .select(`
          id, booking_id, room_id, item_name, item_code, quantity, unit_price, total_amount,
          notes, recorded_at, approval_status, reviewed_at, reject_reason,
          room:rooms!chargeable_consumptions_room_id_fkey(room_number),
          booking:room_bookings!chargeable_consumptions_booking_id_fkey(booking_number, guest_name)
        `)
        .eq('tenant_id', tenantId!)
        .eq('is_billed', false)
        .order('recorded_at', { ascending: false })
        .limit(500)
      if (statusFilter !== 'all') q = q.eq('approval_status', statusFilter)
      const { data, error } = await q
      if (error) throw error
      let result = (data || []) as unknown as Row[]
      if (selectedHotel?.id) {
        // Filter by hotel via room (room has hotel_id) — fetch room hotel mapping
        const roomIds = Array.from(new Set(result.map(r => r.room_id)))
        if (roomIds.length) {
          const { data: roomData } = await supabase
            .from('rooms')
            .select('id, hotel_id')
            .in('id', roomIds)
          const allowed = new Set((roomData || []).filter(r => r.hotel_id === selectedHotel.id).map(r => r.id))
          result = result.filter(r => allowed.has(r.room_id))
        }
      }
      return result
    },
  })

  // Realtime
  useEffect(() => {
    if (!tenantId) return
    const ch = supabase
      .channel('pending-charges-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chargeable_consumptions' }, () => {
        qc.invalidateQueries({ queryKey: ['pending-charges'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tenantId, qc])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(r =>
      r.item_name.toLowerCase().includes(s) ||
      (r.booking?.booking_number || '').toLowerCase().includes(s) ||
      (r.booking?.guest_name || '').toLowerCase().includes(s) ||
      (r.room?.room_number || '').toLowerCase().includes(s)
    )
  }, [rows, search])

  const selectedIds = Object.keys(selected).filter(id => selected[id])
  const selectedRows = filtered.filter(r => selected[r.id])
  const selectedTotal = selectedRows.reduce((s, r) => s + (r.total_amount || r.quantity * r.unit_price), 0)
  const allSelected = filtered.length > 0 && filtered.every(r => selected[r.id])

  const reviewMut = useMutation({
    mutationFn: async ({ ids, decision, reason }: { ids: string[]; decision: 'approved' | 'rejected'; reason?: string }) => {
      const { data, error } = await supabase.rpc('review_chargeable_consumptions', {
        p_ids: ids,
        p_decision: decision,
        p_reason: reason ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.decision === 'approved' ? 'Đã duyệt khoản phí' : 'Đã từ chối khoản phí')
      setSelected({})
      setRejectOpen(false)
      setRejectReason('')
      qc.invalidateQueries({ queryKey: ['pending-charges'] })
    },
    onError: (e: any) => toast.error('Lỗi: ' + e.message),
  })

  const overrideMut = useMutation({
    mutationFn: async ({ id, dec, rs }: { id: string; dec: 'approved' | 'rejected'; rs: string }) => {
      const { data, error } = await supabase.rpc('manager_override_charge', {
        p_charge_id: id, p_decision: dec, p_override_reason: rs,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Đã ghi đè quyết định')
      setOverrideRow(null); setOverrideReason('')
      qc.invalidateQueries({ queryKey: ['pending-charges'] })
    },
    onError: (e: any) => toast.error('Lỗi: ' + e.message),
  })

  const toggleAll = () => {
    if (allSelected) setSelected({})
    else setSelected(Object.fromEntries(filtered.map(r => [r.id, true])))
  }

  const onApprove = () => {
    if (!selectedIds.length) return
    reviewMut.mutate({ ids: selectedIds, decision: 'approved' })
  }
  const onReject = () => {
    if (!selectedIds.length) return
    setRejectOpen(true)
  }
  const confirmReject = () => {
    if (!rejectReason.trim()) {
      toast.error('Vui lòng nhập lý do từ chối')
      return
    }
    reviewMut.mutate({ ids: selectedIds, decision: 'rejected', reason: rejectReason.trim() })
  }

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-4">
      <header>
        <h1 className="text-xl md:text-2xl font-semibold">Duyệt khoản phí</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Lễ tân kiểm tra & duyệt các khoản tiêu hao tính phí trước khi đưa vào hóa đơn.
        </p>
      </header>

      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setSelected({}) }}>
          <SelectTrigger className="h-9 w-full md:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Chờ duyệt</SelectItem>
            <SelectItem value="approved">Đã duyệt</SelectItem>
            <SelectItem value="rejected">Đã từ chối</SelectItem>
            <SelectItem value="all">Tất cả</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="h-9 md:max-w-xs"
          placeholder="Tìm phòng / khách / mã booking / tên item"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        {selectedIds.length > 0 && statusFilter === 'pending' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selectedIds.length} mục · {formatCurrency(selectedTotal)}
            </span>
            <Button size="sm" variant="outline" onClick={onReject} disabled={reviewMut.isPending}>
              Từ chối
            </Button>
            <Button size="sm" onClick={onApprove} disabled={reviewMut.isPending}>
              Duyệt
            </Button>
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b bg-muted/40 text-xs font-medium">
          <div className="col-span-1">
            {statusFilter === 'pending' && (
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            )}
          </div>
          <div className="col-span-4 md:col-span-3">Item</div>
          <div className="col-span-2 hidden md:block">Phòng / Booking</div>
          <div className="col-span-2 md:col-span-1 text-right">SL</div>
          <div className="col-span-3 md:col-span-2 text-right">Thành tiền</div>
          <div className="col-span-2 md:col-span-1 text-right">Trạng thái</div>
          <div className="col-span-2 hidden md:block text-right">Lúc</div>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Không có khoản phí nào</div>
        ) : (
          filtered.map(r => {
            const total = r.total_amount || r.quantity * r.unit_price
            const statusText =
              r.approval_status === 'pending' ? <span className="text-amber-600">Chờ</span>
              : r.approval_status === 'approved' ? <span className="text-green-600">Duyệt</span>
              : <span className="text-red-600">Từ chối</span>
            return (
              <div key={r.id} className="grid grid-cols-12 gap-2 px-3 py-2 border-b items-center text-sm">
                <div className="col-span-1">
                  {r.approval_status === 'pending' && (
                    <Checkbox
                      checked={!!selected[r.id]}
                      onCheckedChange={(c) => setSelected(prev => ({ ...prev, [r.id]: !!c }))}
                    />
                  )}
                </div>
                <div className="col-span-4 md:col-span-3 min-w-0">
                  <div className="truncate font-medium">{r.item_name}</div>
                  {r.item_code && <div className="font-mono text-xs text-muted-foreground">{r.item_code}</div>}
                  {r.notes && <div className="text-xs text-muted-foreground truncate">{r.notes}</div>}
                  {r.reject_reason && (
                    <div className="text-xs text-red-600 truncate">Từ chối: {r.reject_reason}</div>
                  )}
                </div>
                <div className="col-span-2 hidden md:block text-xs">
                  <div>P. {r.room?.room_number || '—'}</div>
                  <div className="text-muted-foreground truncate">
                    {r.booking?.guest_name || r.booking?.booking_number || '—'}
                  </div>
                </div>
                <div className="col-span-2 md:col-span-1 text-right">{r.quantity}</div>
                <div className="col-span-3 md:col-span-2 text-right font-medium">{formatCurrency(total)}</div>
                <div className="col-span-2 md:col-span-1 text-right text-xs">{statusText}</div>
                <div className="col-span-2 hidden md:block text-right text-xs text-muted-foreground">
                  {format(new Date(r.recorded_at), 'dd/MM HH:mm')}
                  {isManager && r.approval_status !== 'pending' && (
                    <div className="mt-1">
                      <button
                        type="button"
                        className="text-[10px] text-blue-600 hover:underline"
                        onClick={() => {
                          setOverrideRow(r)
                          setOverrideDecision(r.approval_status === 'rejected' ? 'approved' : 'rejected')
                          setOverrideReason('')
                        }}
                      >Ghi đè</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <Dialog open={!!overrideRow} onOpenChange={(o) => { if (!o) setOverrideRow(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ghi đè quyết định lễ tân</DialogTitle>
            <DialogDescription>
              {overrideRow && (
                <>
                  {overrideRow.item_name} · {formatCurrency(overrideRow.total_amount || overrideRow.quantity * overrideRow.unit_price)}
                  <br />
                  Hiện tại: <b>{overrideRow.approval_status === 'approved' ? 'Đã duyệt' : 'Đã từ chối'}</b>
                  {' → '}
                  Ghi đè thành: <b>{overrideDecision === 'approved' ? 'Duyệt' : 'Từ chối'}</b>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Lý do ghi đè (bắt buộc, tối thiểu 5 ký tự)"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideRow(null)}>Hủy</Button>
            <Button
              disabled={overrideMut.isPending || overrideReason.trim().length < 5}
              onClick={() => overrideRow && overrideMut.mutate({
                id: overrideRow.id, dec: overrideDecision, rs: overrideReason.trim(),
              })}
            >Xác nhận ghi đè</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối khoản phí</DialogTitle>
            <DialogDescription>
              Sẽ từ chối {selectedIds.length} khoản · {formatCurrency(selectedTotal)}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Lý do từ chối (bắt buộc)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Hủy</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={reviewMut.isPending}>
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
