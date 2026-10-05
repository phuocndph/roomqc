import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  AlertTriangle,
  Package,
  DollarSign,
  TrendingDown,
  Download,
  ArrowLeft,
  Home,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MobileDamagesReportPage } from '@/components/reports/MobileDamagesReportPage'
import { HotelFilterCard } from '@/components/reports/HotelFilterCard'

interface DamageItem {
  item_id?: string
  item_name?: string
  item_code?: string
  quantity?: number
  notes?: string
}

interface DamageRecord {
  id: string
  room_number: string
  check_type: string
  items_damaged: DamageItem[]
  items_lost: DamageItem[]
  created_at: string
  estimated_value: number
}

interface DateRange {
  start: Date
  end: Date
}

// Normalize: DB may store as JSONB array OR legacy object {itemId: qty}
function normalizeDamageList(raw: unknown): DamageItem[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as DamageItem[]
  if (typeof raw === 'object') {
    if (import.meta.env.DEV) {
      console.warn('[DamagesReport] Legacy object shape for items list, expected array:', raw)
    }
    return Object.entries(raw as Record<string, unknown>).map(([itemId, val]) => ({
      item_id: itemId,
      quantity: typeof val === 'number' ? val : Number(val) || 1,
    }))
  }
  if (import.meta.env.DEV) {
    console.warn('[DamagesReport] Unknown items list shape, falling back to empty:', raw)
  }
  return []
}

function totalQty(list: DamageItem[]): number {
  return list.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0)
}

export function DamagesReportPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const [dateRange, setDateRange] = useState<DateRange>({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date()),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['damages-report', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id, dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async (): Promise<{
      records: DamageRecord[]
      summary: { totalDamaged: number; totalLost: number; totalValue: number; totalIncidents: number }
      problematicRooms: { room: string; damaged: number; lost: number; count: number }[]
    }> => {
      if (!tenantId) {
        return { records: [], summary: { totalDamaged: 0, totalLost: 0, totalValue: 0, totalIncidents: 0 }, problematicRooms: [] }
      }

      // Pre-fetch room ids for selected hotel so we can filter at DB level
      let roomIdsForHotel: string[] | null = null
      if (!isAllHotelsMode && selectedHotel?.id) {
        const { data: hotelRooms } = await supabase
          .from('rooms')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('hotel_id', selectedHotel.id)
        roomIdsForHotel = (hotelRooms || []).map(r => r.id)
        if (roomIdsForHotel.length === 0) {
          return { records: [], summary: { totalDamaged: 0, totalLost: 0, totalValue: 0, totalIncidents: 0 }, problematicRooms: [] }
        }
      }

      const baseQuery = (supabase.from('room_checks') as any)
        .select('id, check_type, items_damaged, items_lost, checked_at, room_id')
        .eq('tenant_id', tenantId)
        .gte('checked_at', dateRange.start.toISOString())
        .lte('checked_at', dateRange.end.toISOString())
        .order('checked_at', { ascending: false })

      const query = roomIdsForHotel ? baseQuery.in('room_id', roomIdsForHotel) : baseQuery
      const { data: roomChecks, error } = await query
      if (error) throw error

      // Map rooms for display
      const roomIds = ([...new Set((roomChecks || []).map((c: any) => c.room_id).filter(Boolean))] as string[])
      const { data: rooms } = roomIds.length > 0
        ? await supabase.from('rooms').select('id, room_number').in('id', roomIds)
        : { data: [] as any[] }
      const roomMap = new Map((rooms || []).map(r => [r.id, r.room_number]))

      // Items map for price lookups
      const { data: items } = await supabase
        .from('items')
        .select('id, unit_price')
        .eq('tenant_id', tenantId)
      const priceMap = new Map((items || []).map(i => [i.id, i.unit_price || 50000]))
      const priceFor = (id?: string) => (id && priceMap.get(id)) || 50000

      const records: DamageRecord[] = []
      let totalDamaged = 0
      let totalLost = 0
      let totalValue = 0
      const roomStats: Record<string, { damaged: number; lost: number; count: number }> = {}

      for (const check of roomChecks || []) {
        const damaged = normalizeDamageList((check as any).items_damaged)
        const lost = normalizeDamageList((check as any).items_lost)
        const damagedCount = totalQty(damaged)
        const lostCount = totalQty(lost)
        if (damagedCount === 0 && lostCount === 0) continue

        let estimatedValue = 0
        damaged.forEach(it => {
          estimatedValue += priceFor(it.item_id) * 0.5 * (Number(it.quantity) || 1)
        })
        lost.forEach(it => {
          estimatedValue += priceFor(it.item_id) * (Number(it.quantity) || 1)
        })

        const roomNumber = roomMap.get((check as any).room_id) || 'N/A'
        records.push({
          id: (check as any).id,
          room_number: roomNumber,
          check_type: (check as any).check_type,
          items_damaged: damaged,
          items_lost: lost,
          created_at: (check as any).checked_at,
          estimated_value: estimatedValue,
        })

        totalDamaged += damagedCount
        totalLost += lostCount
        totalValue += estimatedValue

        if (!roomStats[roomNumber]) roomStats[roomNumber] = { damaged: 0, lost: 0, count: 0 }
        roomStats[roomNumber].damaged += damagedCount
        roomStats[roomNumber].lost += lostCount
        roomStats[roomNumber].count += 1
      }

      const problematicRooms = Object.entries(roomStats)
        .map(([room, stats]) => ({ room, ...stats }))
        .sort((a, b) => (b.damaged + b.lost) - (a.damaged + a.lost))
        .slice(0, 5)

      return {
        records,
        summary: { totalDamaged, totalLost, totalValue, totalIncidents: records.length },
        problematicRooms,
      }
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
  })

  const handleDateRangeChange = (range: { from?: Date; to?: Date }) => {
    if (range.from && range.to) {
      setDateRange({ start: range.from, end: range.to })
    }
  }

  const checkTypeLabels: Record<string, string> = {
    checkout: 'Checkout',
    checkin: 'Check-in',
    daily: 'Hàng ngày',
    periodic: 'Định kỳ',
  }

  // Mobile version
  if (isMobile) {
    return (
      <MobileDamagesReportPage
        data={data as any}
        isLoading={isLoading}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        checkTypeLabels={checkTypeLabels}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Báo cáo Hỏng/Mất" description="Thống kê thiệt hại tài sản" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Báo cáo Hỏng/Mất"
        description="Thống kê thiệt hại tài sản theo thời gian"
      >
        <div className="flex items-center gap-2">
          <DateRangePicker
            value={{ from: dateRange.start, to: dateRange.end }}
            onChange={handleDateRangeChange}
            className="w-[280px]"
          />
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Xuất
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigateBack(navigate, '/reports')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Quay lại
          </Button>
        </div>
      </PageHeader>

      <HotelFilterCard />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-xs text-muted-foreground">Tổng sự cố</span>
          </div>
          <p className="text-xl font-semibold">{data?.summary.totalIncidents || 0}</p>
        </div>
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-orange-600" />
            <span className="text-xs text-muted-foreground">Đồ bị hỏng</span>
          </div>
          <p className="text-xl font-semibold text-orange-600">{data?.summary.totalDamaged || 0} <span className="text-sm font-normal">món</span></p>
        </div>
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-red-600" />
            <span className="text-xs text-muted-foreground">Đồ bị mất</span>
          </div>
          <p className="text-xl font-semibold text-red-600">{data?.summary.totalLost || 0} <span className="text-sm font-normal">món</span></p>
        </div>
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-red-600" />
            <span className="text-xs text-muted-foreground">Giá trị thiệt hại</span>
          </div>
          <p className="text-xl font-semibold text-red-600">{formatCurrency(data?.summary.totalValue || 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Problematic Rooms */}
        <div className="border rounded-lg">
          <div className="p-3 border-b">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              <span className="text-sm font-medium">Phòng có vấn đề nhiều nhất</span>
            </div>
          </div>
          <div className="divide-y">
            {data?.problematicRooms && data.problematicRooms.length > 0 ? (
              data.problematicRooms.map((room, index) => (
                <div key={room.room} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium',
                      index === 0 ? 'bg-red-100 text-red-600' :
                      index === 1 ? 'bg-orange-100 text-orange-600' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium">Phòng {room.room}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-orange-600">Hỏng: {room.damaged}</span>
                    <span className="text-red-600">Mất: {room.lost}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                Không có dữ liệu
              </p>
            )}
          </div>
        </div>

        {/* Recent Incidents Table */}
        <div className="border rounded-lg lg:col-span-2">
          <div className="p-3 border-b">
            <span className="text-sm font-medium">Sự cố gần đây</span>
          </div>
          {data?.records && data.records.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Phòng</TableHead>
                    <TableHead className="text-xs">Loại</TableHead>
                    <TableHead className="text-xs">Vật phẩm & nguyên nhân</TableHead>
                    <TableHead className="text-xs text-center">Hỏng</TableHead>
                    <TableHead className="text-xs text-center">Mất</TableHead>
                    <TableHead className="text-xs text-right">Giá trị</TableHead>
                    <TableHead className="text-xs text-right">Ngày</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.records.slice(0, 20).map((record) => {
                    const damagedQty = totalQty(record.items_damaged)
                    const lostQty = totalQty(record.items_lost)
                    return (
                      <TableRow key={record.id}>
                        <TableCell className="text-sm font-medium">{record.room_number}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {checkTypeLabels[record.check_type] || record.check_type}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="space-y-0.5">
                            {record.items_damaged.map((it, i) => (
                              <div key={`d-${i}`} className="text-orange-600">
                                {it.item_name || it.item_code || it.item_id || 'Không tên'}
                                {it.notes ? <span className="text-muted-foreground"> — {it.notes}</span> : null}
                              </div>
                            ))}
                            {record.items_lost.map((it, i) => (
                              <div key={`l-${i}`} className="text-red-600">
                                {it.item_name || it.item_code || it.item_id || 'Không tên'}
                                {it.notes ? <span className="text-muted-foreground"> — {it.notes}</span> : null}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-orange-600 text-sm">{damagedQty}</TableCell>
                        <TableCell className="text-center text-red-600 text-sm">{lostQty}</TableCell>
                        <TableCell className="text-right text-red-600 text-sm">
                          {formatCurrency(record.estimated_value)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {format(new Date(record.created_at), 'dd/MM/yyyy')}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Không có sự cố nào trong khoảng thời gian này
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
