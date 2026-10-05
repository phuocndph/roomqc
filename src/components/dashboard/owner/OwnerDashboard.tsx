import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { useBreakpoint } from '@/lib/breakpoints'
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
import { MobileOwnerDashboard } from './MobileOwnerDashboard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { subMonths, startOfMonth, endOfMonth } from 'date-fns'

type DateRangePreset = '1m' | '3m' | '6m' | '12m'

export function OwnerDashboard() {
  const { user } = useUser()
  const { isAllHotelsMode, selectedHotel } = useHotelContext()
  const { isMobile } = useBreakpoint()
  const { hasMode } = useUsageMode()
  const [datePreset, setDatePreset] = useState<DateRangePreset>('1m')

  const monthsCount = parseInt(datePreset)
  const dateRange = {
    start: startOfMonth(subMonths(new Date(), monthsCount - 1)),
    end: endOfMonth(new Date()),
  }

  if (isMobile) {
    return <MobileOwnerDashboard dateRange={dateRange} datePreset={datePreset} onDatePresetChange={setDatePreset} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Xin chào, ${user?.full_name || 'Chủ sở hữu'}`}
        description={
          isAllHotelsMode
            ? 'Tổng quan hiệu suất toàn hệ thống'
            : `Hiệu suất ${selectedHotel?.name || ''}`
        }
      >
        <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DateRangePreset)}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1m">1 tháng</SelectItem>
            <SelectItem value="3m">3 tháng</SelectItem>
            <SelectItem value="6m">6 tháng</SelectItem>
            <SelectItem value="12m">12 tháng</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {/* Setup Checklist - hiển thị khi tenant chưa cấu hình đủ */}
      <SetupChecklist />

      {/* Smart Alerts - Show first for immediate attention */}
      <OwnerSmartAlerts />

      {/* Room & Revenue Overview - Real-time operational view */}
      <div className="grid lg:grid-cols-2 gap-6">
        <OwnerRoomOverview />
        <OwnerRevenueOverview />
      </div>

      {/* Profit Overview - Key financial metrics */}
      <OwnerProfitOverview />

      {/* Financial Overview */}
      <FinancialOverview dateRange={dateRange} />

      {/* Quick Links */}
      <OwnerQuickLinks />

      {/* Expense Trend Chart - Standard mode and above */}
      {hasMode('standard') && (
        <ExpenseChart months={parseInt(datePreset)} showBarChart={true} />
      )}

      {/* Hotel Performance Comparison - Only show in All Hotels mode & full mode */}
      {isAllHotelsMode && hasMode('full') && <HotelPerformanceTable dateRange={dateRange} />}
    </div>
  )
}
