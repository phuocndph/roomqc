import { useNavigate } from 'react-router-dom'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { Button } from '@/components/ui/button'
import { navigateBack } from '@/lib/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  AlertTriangle, 
  Package, 
  DollarSign, 
  TrendingDown,
  Download,
  Home,
  Calendar
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { DateRangePicker } from '@/components/shared/DateRangePicker'

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
  items_damaged: DamageItem[] | Record<string, number>
  items_lost: DamageItem[] | Record<string, number>
  created_at: string
  estimated_value: number
}

function totalQty(raw: unknown): number {
  if (!raw) return 0
  if (Array.isArray(raw)) {
    return (raw as any[]).reduce((s: number, it: any) => s + (Number(it?.quantity) || 1), 0)
  }
  if (typeof raw === 'object') {
    return (Object.values(raw as Record<string, unknown>) as unknown[])
      .reduce<number>((s, v) => s + (Number(v) || 0), 0)
  }
  return 0
}

interface MobileDamagesReportPageProps {
  data?: {
    records: DamageRecord[]
    summary: {
      totalDamaged: number
      totalLost: number
      totalValue: number
      totalIncidents: number
    }
    problematicRooms: { room: string; damaged: number; lost: number; count: number }[]
  }
  isLoading: boolean
  dateRange: { start: Date; end: Date }
  onDateRangeChange: (range: { from?: Date; to?: Date }) => void
  checkTypeLabels: Record<string, string>
}

export function MobileDamagesReportPage({
  data,
  isLoading,
  dateRange,
  onDateRangeChange,
  checkTypeLabels,
}: MobileDamagesReportPageProps) {
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <MobileDetailHeader title="Báo cáo Hỏng/Mất" onBack={() => navigateBack(navigate, '/reports')} />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-40" />
          <Skeleton className="h-60" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <MobileDetailHeader title="Báo cáo Hỏng/Mất" onBack={() => navigateBack(navigate, '/reports')} />
      
      <div className="p-4 space-y-4">
        {/* Date Filter */}
        <div className="flex items-center gap-2">
          <DateRangePicker
            value={{ from: dateRange.start, to: dateRange.end }}
            onChange={onDateRangeChange}
            className="flex-1"
          />
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Tải xuống">
            <Download className="h-4 w-4" />
          </Button>
        </div>

        {/* Summary Stats - 2x2 Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-xs text-muted-foreground">Tổng sự cố</span>
            </div>
            <p className="text-lg font-semibold">{data?.summary.totalIncidents || 0}</p>
          </div>
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Package className="h-3.5 w-3.5 text-orange-600" />
              <span className="text-xs text-muted-foreground">Đồ bị hỏng</span>
            </div>
            <p className="text-lg font-semibold text-orange-600">{data?.summary.totalDamaged || 0}</p>
          </div>
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-red-600" />
              <span className="text-xs text-muted-foreground">Đồ bị mất</span>
            </div>
            <p className="text-lg font-semibold text-red-600">{data?.summary.totalLost || 0}</p>
          </div>
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-red-600" />
              <span className="text-xs text-muted-foreground">Thiệt hại</span>
            </div>
            <p className="text-lg font-semibold text-red-600">{formatCurrency(data?.summary.totalValue || 0)}</p>
          </div>
        </div>

        {/* Problematic Rooms */}
        <div className="border rounded-lg">
          <div className="p-3 border-b flex items-center gap-2">
            <Home className="h-4 w-4" />
            <span className="text-sm font-medium">Phòng có vấn đề nhiều</span>
          </div>
          <div className="divide-y">
            {data?.problematicRooms && data.problematicRooms.length > 0 ? (
              data.problematicRooms.slice(0, 5).map((room, index) => (
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
                    <span className="text-sm font-medium">P. {room.room}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-orange-600">Hỏng: {room.damaged}</span>
                    <span className="text-red-600">Mất: {room.lost}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Không có dữ liệu
              </p>
            )}
          </div>
        </div>

        {/* Recent Incidents */}
        <div className="border rounded-lg">
          <div className="p-3 border-b">
            <span className="text-sm font-medium">Sự cố gần đây</span>
          </div>
          <div className="divide-y">
            {data?.records && data.records.length > 0 ? (
              data.records.slice(0, 10).map((record) => {
                const damagedCount = totalQty(record.items_damaged)
                const lostCount = totalQty(record.items_lost)
                
                return (
                  <div key={record.id} className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">Phòng {record.room_number}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(record.created_at), 'dd/MM/yy')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {checkTypeLabels[record.check_type] || record.check_type}
                      </span>
                      <div className="flex items-center gap-3 text-xs">
                        {damagedCount > 0 && (
                          <span className="text-orange-600">Hỏng: {damagedCount}</span>
                        )}
                        {lostCount > 0 && (
                          <span className="text-red-600">Mất: {lostCount}</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-right">
                      <span className="text-sm text-red-600 font-medium">
                        {formatCurrency(record.estimated_value)}
                      </span>
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                Không có sự cố nào trong khoảng thời gian này
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
