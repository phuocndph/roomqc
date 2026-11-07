import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useHotelContext } from '@/contexts/HotelContext'
import { useUsageMode } from '@/hooks/useUsageMode'
import { FinancialOverview } from './FinancialOverview'
import { HotelPerformanceTable } from './HotelPerformanceTable'
import { OwnerSmartAlerts } from './OwnerSmartAlerts'
import { OwnerProfitOverview } from './OwnerProfitOverview'
import { ExpenseChart } from '../ExpenseChart'
import { OwnerQuickLinks } from './OwnerQuickLinks'
import { SetupChecklist } from './SetupChecklist'
import { OwnerRoomOverview } from './OwnerRoomOverview'
import { OwnerRevenueOverview } from './OwnerRevenueOverview'
import { RoomOperationsBoard } from '../RoomOperationsBoard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { subMonths, startOfMonth, endOfMonth, format } from 'date-fns'
import { vi } from 'date-fns/locale'

type DateRangePreset = '1m' | '3m' | '6m' | '12m'

export function OwnerDashboard() {
  const { isAllHotelsMode, selectedHotel } = useHotelContext()
  const { hasMode } = useUsageMode()
  const [datePreset, setDatePreset] = useState<DateRangePreset>('1m')
  const [reportsOpen, setReportsOpen] = useState(false)

  const monthsCount = parseInt(datePreset)
  const dateRange = {
    start: startOfMonth(subMonths(new Date(), monthsCount - 1)),
    end: endOfMonth(new Date()),
  }

  return (
    <div className="space-y-5 p-4 pb-24 lg:p-0 lg:pb-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tổng quan hôm nay</h1>
          <p className="mt-1 text-sm text-muted-foreground">{isAllHotelsMode ? 'Toàn hệ thống' : selectedHotel?.name} · {format(new Date(), 'EEEE, dd/MM/yyyy', { locale: vi })}</p>
        </div>
        <Button asChild><Link to="/bookings?action=new"><Plus className="h-4 w-4" />Tạo đặt phòng</Link></Button>
      </header>

      {!isAllHotelsMode && <RoomOperationsBoard />}

      <OwnerSmartAlerts />

      {/* Room & Revenue Overview - Real-time operational view */}
      <div className="grid lg:grid-cols-2 gap-6">
        <OwnerRoomOverview showSummary={isAllHotelsMode} />
        <OwnerRevenueOverview />
      </div>

      <details className="group border bg-card" onToggle={event => setReportsOpen(event.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span>Báo cáo & Chi phí<span className="mt-1 block text-xs font-normal text-muted-foreground">Doanh thu theo tháng, chi phí vận hành và so sánh khách sạn</span></span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        {reportsOpen && <div className="space-y-5 border-t p-4">
          <OwnerProfitOverview />
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Chi phí theo kỳ</h2>
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DateRangePreset)}>
              <SelectTrigger className="h-10 w-36" aria-label="Kỳ báo cáo chi phí"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="1m">1 tháng</SelectItem><SelectItem value="3m">3 tháng</SelectItem><SelectItem value="6m">6 tháng</SelectItem><SelectItem value="12m">12 tháng</SelectItem></SelectContent>
            </Select>
          </div>
          <FinancialOverview dateRange={dateRange} />
          {hasMode('standard') && <ExpenseChart months={monthsCount} showBarChart />}
          {isAllHotelsMode && hasMode('full') && <HotelPerformanceTable dateRange={dateRange} />}
        </div>}
      </details>
      <SetupChecklist />
      <OwnerQuickLinks />
    </div>
  )
}
