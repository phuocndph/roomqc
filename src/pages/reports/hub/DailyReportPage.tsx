import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { formatCurrency, cn } from '@/lib/utils'
import { OTA_SOURCES } from '@/lib/constants'
import { differenceInCalendarDays, format, subDays, startOfDay, endOfDay } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BedDouble,
  LogIn,
  LogOut,
  Banknote,
  CreditCard,
  AlertCircle,
  Bell,
  ClipboardList,
  Send,
} from 'lucide-react'
import { AlertList } from '@/components/reports/AlertList'
import { useOverviewAlerts } from '@/hooks/useOverviewAlerts'
import { useShiftNotes } from '@/hooks/useShiftNotes'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { toast } from 'sonner'

function Delta({ value }: { value: number | null }) {
  if (value === null || value === undefined) return null
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-green-600">
        <TrendingUp className="h-3 w-3" />+{value.toFixed(1)}%
      </span>
    )
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-red-600">
        <TrendingDown className="h-3 w-3" />
        {value.toFixed(1)}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" />
      0%
    </span>
  )
}

function KpiRow({
  label,
  value,
  sub,
  delta,
  href,
}: {
  label: string
  value: string
  sub?: string
  delta?: number | null
  href?: string
}) {
  const content = (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground/70">{sub}</div>}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold tabular-nums">{value}</div>
        {delta !== undefined && <Delta value={delta ?? null} />}
      </div>
    </div>
  )
  return href ? (
    <Link to={href} className="block hover:bg-muted/40 -mx-2 px-2 rounded">
      {content}
    </Link>
  ) : (
    content
  )
}

export function DailyReportPage() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null

  const today = new Date()
  const yesterday = subDays(today, 1)

  // Doanh thu hôm qua vs trung bình 7 ngày trước
  const { data: revenueData, isLoading: revLoading } = useQuery({
    queryKey: ['daily-report-revenue', tenantId, hotelId, format(yesterday, 'yyyy-MM-dd')],
    enabled: !!tenantId,
    queryFn: async () => {
      const fetchPayments = async (start: Date, end: Date) => {
        let q = supabase
          .from('booking_payments')
          .select('amount, payment_method, booking_id, paid_at')
          .eq('tenant_id', tenantId!)
          .eq('payment_status', 'completed')
          .gte('paid_at', startOfDay(start).toISOString())
          .lte('paid_at', endOfDay(end).toISOString())
        if (hotelId) q = q.eq('hotel_id', hotelId)
        const { data } = await q
        return data || []
      }
      const sevenDaysAgo = subDays(yesterday, 7)
      const [yday, prev7days] = await Promise.all([
        fetchPayments(yesterday, yesterday),
        fetchPayments(sevenDaysAgo, subDays(yesterday, 1)),
      ])

      // OTA: dựa vào booking_source của booking liên quan
      const bookingIds = Array.from(new Set(yday.map((p: any) => p.booking_id).filter(Boolean)))
      let otaBookingIds = new Set<string>()
      if (bookingIds.length > 0) {
        const { data: bks } = await supabase
          .from('room_bookings')
          .select('id, booking_source')
          .in('id', bookingIds)
        otaBookingIds = new Set(
          (bks || [])
            .filter((b: any) => OTA_SOURCES.includes(b.booking_source))
            .map((b: any) => b.id),
        )
      }

      const sum = (rows: any[]) => rows.reduce((s, r) => s + Number(r.amount || 0), 0)
      const ydayTotal = sum(yday)
      const avg7 = sum(prev7days) / 7
      const delta = avg7 > 0 ? ((ydayTotal - avg7) / avg7) * 100 : null
      const cash = sum(yday.filter((r: any) => r.payment_method === 'cash'))
      const transfer = sum(yday.filter((r: any) => r.payment_method === 'bank_transfer'))
      const ota = sum(yday.filter((r: any) => otaBookingIds.has(r.booking_id)))
      return { total: ydayTotal, delta, avg7, cash, transfer, ota }
    },
  })

  // ADR trung bình 30 ngày gần nhất (để ước tính doanh thu bị block bởi phòng bảo trì)
  const { data: adrData } = useQuery({
    queryKey: ['daily-report-adr', tenantId, hotelId],
    enabled: !!tenantId,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const from = startOfDay(subDays(new Date(), 30)).toISOString()
      let q = supabase
        .from('room_bookings')
        .select('total_amount, check_in_date, check_out_date')
        .eq('tenant_id', tenantId!)
        .eq('status', 'checked_out')
        .gte('check_out_date', from)
      if (hotelId) q = q.eq('hotel_id', hotelId)
      const { data } = await q
      const rows = data || []
      const totalRevenue = rows.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0)
      const totalNights = rows.reduce((s: number, r: any) => {
        if (!r.check_in_date || !r.check_out_date) return s
        return s + Math.max(1, differenceInCalendarDays(new Date(r.check_out_date), new Date(r.check_in_date)))
      }, 0)
      return totalNights > 0 ? totalRevenue / totalNights : 0
    },
  })

  // Tình trạng phòng hôm nay
  const { data: roomData, isLoading: roomLoading } = useQuery({
    queryKey: ['daily-report-rooms', tenantId, hotelId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase.from('rooms').select('status').eq('tenant_id', tenantId!)
      if (hotelId) q = q.eq('hotel_id', hotelId)
      const { data } = await q
      const rows = data || []
      return {
        total: rows.length,
        occupied: rows.filter((r: any) => r.status === 'occupied').length,
        vacant: rows.filter((r: any) => r.status === 'vacant').length,
        cleaning: rows.filter((r: any) => r.status === 'cleaning').length,
        maintenance: rows.filter((r: any) => r.status === 'maintenance').length,
      }
    },
  })

  // Check-in/out hôm nay
  const { data: movementData, isLoading: movLoading } = useQuery({
    queryKey: ['daily-report-movement', tenantId, hotelId, format(today, 'yyyy-MM-dd')],
    enabled: !!tenantId,
    queryFn: async () => {
      let qIn = supabase
        .from('room_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!)
        .gte('check_in_date', startOfDay(today).toISOString())
        .lte('check_in_date', endOfDay(today).toISOString())
        .eq('status', 'confirmed')
      let qOut = supabase
        .from('room_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!)
        .gte('check_out_date', startOfDay(today).toISOString())
        .lte('check_out_date', endOfDay(today).toISOString())
        .eq('status', 'checked_in')
      if (hotelId) {
        qIn = qIn.eq('hotel_id', hotelId)
        qOut = qOut.eq('hotel_id', hotelId)
      }
      const [inRes, outRes] = await Promise.all([qIn, qOut])
      return { checkIn: inRes.count || 0, checkOut: outRes.count || 0 }
    },
  })

  // Công nợ chưa thu
  const { data: debtData, isLoading: debtLoading } = useQuery({
    queryKey: ['daily-report-debt', tenantId, hotelId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from('room_bookings')
        .select('id, guest_name, total_amount, amount_paid')
        .eq('tenant_id', tenantId!)
        .eq('status', 'checked_in')
        .gt('total_amount', 0)
      if (hotelId) q = q.eq('hotel_id', hotelId)
      const { data } = await q
      const rows = data || []
      const unpaid = rows.filter(
        (r: any) => Number(r.amount_paid || 0) < Number(r.total_amount || 0),
      )
      const totalDebt = unpaid.reduce(
        (s: number, r: any) =>
          s + Math.max(0, Number(r.total_amount || 0) - Number(r.amount_paid || 0)),
        0,
      )
      return { count: unpaid.length, total: totalDebt }
    },
  })

  const alertsQ = useOverviewAlerts()
  const { notes, save } = useShiftNotes(3)
  const [noteText, setNoteText] = useState('')
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const handleSaveNote = async () => {
    if (!noteText.trim()) return
    try {
      await save.mutateAsync({ content: noteText.trim(), noteDate: todayStr })
      setNoteText('')
      toast.success('Đã lưu ghi chú ca')
    } catch {
      toast.error('Lưu thất bại')
    }
  }

  const isLoading = revLoading || roomLoading || movLoading || debtLoading
  const occupancyPct =
    roomData && roomData.total > 0 ? Math.round((roomData.occupied / roomData.total) * 100) : 0

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo ngày</h1>
        <p className="text-sm text-muted-foreground">
          {format(today, "EEEE, dd/MM/yyyy", { locale: vi })}
        </p>
      </div>

      {/* Tình trạng phòng */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BedDouble className="h-4 w-4 text-muted-foreground" /> Tình trạng phòng hôm nay
          </div>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{occupancyPct}%</span>
                <span className="text-xs text-muted-foreground">
                  công suất ({roomData?.occupied}/{roomData?.total} phòng)
                </span>
              </div>
              <div className="space-y-1">
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={cn(
                      "h-2 rounded-full transition-all",
                      occupancyPct >= 80 ? "bg-green-500" : occupancyPct >= 50 ? "bg-amber-500" : "bg-destructive"
                    )}
                    style={{ width: `${occupancyPct}%` }}
                  />
                </div>
                <div className={cn(
                  "text-xs font-medium tabular-nums",
                  occupancyPct >= 80 ? "text-green-600" : occupancyPct >= 50 ? "text-amber-600" : "text-destructive"
                )}>
                  {occupancyPct}%
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="text-green-600">Trống: {roomData?.vacant}</span>
                <span className="text-amber-600">Đang dọn: {roomData?.cleaning}</span>
                {(roomData?.maintenance || 0) > 0 && (
                  <span className="text-red-600">Bảo trì: {roomData?.maintenance}</span>
                )}
              </div>
              {(roomData?.maintenance || 0) > 0 && (
                <div className="mt-2 p-2 rounded bg-destructive/10 text-xs text-destructive space-y-0.5">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {roomData?.maintenance} phòng đang bảo trì — không thể bán
                  </div>
                  {adrData && adrData > 0 && (
                    <p className="text-destructive/80 pl-[18px]">
                      Ước tính block ≈ {formatCurrency(adrData * (roomData?.maintenance || 0))} doanh thu hôm nay
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Check-in / Check-out hôm nay */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <LogIn className="h-4 w-4 text-muted-foreground" /> Lịch di chuyển hôm nay
          </div>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <KpiRow
                label="Khách nhận phòng"
                value={`${movementData?.checkIn ?? 0}`}
                href="/bookings?status=confirmed"
              />
              <KpiRow
                label="Khách trả phòng"
                value={`${movementData?.checkOut ?? 0}`}
                href="/bookings?status=checked_in"
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Doanh thu hôm qua */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Banknote className="h-4 w-4 text-muted-foreground" /> Doanh thu hôm qua (
            {format(yesterday, 'dd/MM')})
          </div>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <KpiRow
                label="Tổng thu"
                value={formatCurrency(revenueData?.total || 0)}
                sub={`TB 7 ngày trước: ${formatCurrency(revenueData?.avg7 || 0)}`}
                delta={revenueData?.delta ?? null}
              />
              <KpiRow label="Tiền mặt" value={formatCurrency(revenueData?.cash || 0)} />
              <KpiRow
                label="Chuyển khoản"
                value={formatCurrency(revenueData?.transfer || 0)}
              />
              {(revenueData?.ota || 0) > 0 && (
                <KpiRow label="OTA" value={formatCurrency(revenueData?.ota || 0)} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Công nợ chưa thu */}
      {(debtData?.count || 0) > 0 && (
        <Card className="border-amber-500/40">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
              <AlertCircle className="h-4 w-4" /> Tiền chưa thu
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {debtData?.count} booking đang ở chưa thanh toán đủ
              </div>
              <div className="text-2xl font-bold text-amber-700 tabular-nums">
                {formatCurrency(debtData?.total || 0)}
              </div>
            </div>
            <Link
              to="/bookings?status=checked_in"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <CreditCard className="h-3 w-3" /> Xem chi tiết →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Cần chú ý */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="h-4 w-4 text-muted-foreground" /> Cần chú ý
          </div>
          <AlertList alerts={alertsQ.data} loading={alertsQ.isLoading} />
        </CardContent>
      </Card>

      {/* Ghi chú ca */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="h-4 w-4 text-muted-foreground" /> Ghi chú ca
          </div>

          {/* Nhập ghi chú mới */}
          <div className="space-y-2">
            <Textarea
              placeholder="Nhập thông tin cần bàn giao cho ca tiếp theo..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveNote}
                disabled={!noteText.trim() || save.isPending}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {save.isPending ? 'Đang lưu…' : 'Lưu ghi chú'}
              </Button>
            </div>
          </div>

          {/* Lịch sử 3 ngày gần nhất */}
          {notes.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Ghi chú gần đây</p>
              {notes.slice(0, 5).map((n) => (
                <div key={n.id} className="text-sm border rounded p-2.5 space-y-1 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {format(new Date(n.note_date), 'EEEE dd/MM', { locale: vi })}
                    </span>
                    <span className="text-xs text-muted-foreground">{n.author_name}</span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{n.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default DailyReportPage
