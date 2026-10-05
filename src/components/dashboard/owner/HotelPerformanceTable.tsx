import { useHotelsPerformanceComparison, HotelComparison } from '@/hooks/useHotelPerformance'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Building2, TrendingUp, TrendingDown, ArrowUpDown, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface HotelPerformanceTableProps {
  dateRange: { start: Date; end: Date }
}

type SortKey = 'hotel_name' | 'total_operating_cost' | 'cost_per_room' | 'efficiency_score'

export function HotelPerformanceTable({ dateRange }: HotelPerformanceTableProps) {
  const { data: hotels, isLoading } = useHotelsPerformanceComparison(dateRange)
  const [sortKey, setSortKey] = useState<SortKey>('efficiency_score')
  const [sortDesc, setSortDesc] = useState(true)
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg p-4">
        <Skeleton className="h-5 w-48 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!hotels || hotels.length === 0) {
    return (
      <div className="border border-border rounded-lg p-6 text-center">
        <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Không có dữ liệu so sánh khách sạn</p>
      </div>
    )
  }

  const sortedHotels = [...hotels].sort((a, b) => {
    const aVal = a[sortKey]
    const bVal = b[sortKey]
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal)
    }
    return sortDesc ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number)
  })

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc)
    } else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <button
      type="button"
      onClick={() => handleSort(sortKeyName)}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  )

  // Calculate average for comparison
  const avgCostPerRoom = hotels.reduce((sum, h) => sum + h.cost_per_room, 0) / hotels.length
  const avgEfficiency = hotels.reduce((sum, h) => sum + h.efficiency_score, 0) / hotels.length

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">So sánh hiệu suất khách sạn</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{hotels.length} khách sạn</span>
          <Button variant="ghost" size="sm" onClick={() => navigate('/hotels/performance')}>
            Xem chi tiết <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3">
                <SortHeader label="Khách sạn" sortKeyName="hotel_name" />
              </th>
              <th className="text-right py-2 px-3">
                <span className="text-xs font-medium text-muted-foreground">Số phòng</span>
              </th>
              <th className="text-right py-2 px-3">
                <span className="text-xs font-medium text-muted-foreground">Giá trị tồn</span>
              </th>
              <th className="text-right py-2 px-3">
                <SortHeader label="Tổng chi phí" sortKeyName="total_operating_cost" />
              </th>
              <th className="text-right py-2 px-3">
                <SortHeader label="Chi phí/phòng" sortKeyName="cost_per_room" />
              </th>
              <th className="text-right py-2 px-3">
                <SortHeader label="Hiệu suất" sortKeyName="efficiency_score" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedHotels.map((hotel) => (
              <HotelRow 
                key={hotel.hotel_id} 
                hotel={hotel} 
                avgCostPerRoom={avgCostPerRoom}
                avgEfficiency={avgEfficiency}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HotelRow({ 
  hotel, 
  avgCostPerRoom,
  avgEfficiency 
}: { 
  hotel: HotelComparison
  avgCostPerRoom: number
  avgEfficiency: number
}) {
  const isCostBelowAvg = hotel.cost_per_room < avgCostPerRoom
  const isEfficiencyAboveAvg = hotel.efficiency_score > avgEfficiency

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">{hotel.hotel_name}</p>
            <p className="text-xs text-muted-foreground">{hotel.hotel_code}</p>
          </div>
        </div>
      </td>
      <td className="py-2.5 px-3 text-right text-sm text-foreground">
        {hotel.total_rooms}
      </td>
      <td className="py-2.5 px-3 text-right text-sm text-foreground">
        {formatCurrency(hotel.inventory_value)}
      </td>
      <td className="py-2.5 px-3 text-right text-sm text-foreground">
        {formatCurrency(hotel.total_operating_cost)}
      </td>
      <td className="py-2.5 px-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <span className={cn('text-sm', isCostBelowAvg ? 'text-green-600' : 'text-amber-600')}>
            {formatCurrency(hotel.cost_per_room)}
          </span>
          {isCostBelowAvg ? (
            <TrendingDown className="h-3 w-3 text-green-600" />
          ) : (
            <TrendingUp className="h-3 w-3 text-amber-600" />
          )}
        </div>
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className={cn(
          'text-sm font-medium',
          isEfficiencyAboveAvg ? 'text-green-600' : 'text-muted-foreground'
        )}>
          {hotel.efficiency_score.toFixed(0)}%
        </span>
      </td>
    </tr>
  )
}
