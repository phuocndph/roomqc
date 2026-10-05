import { useState, useMemo } from 'react'
import { startOfWeek, endOfWeek } from 'date-fns'
import { useShiftHistory, calculateShiftStats, type ShiftHistoryFilters } from '@/hooks/useShiftHistory'
import { useStaffStatus } from '@/hooks/useStaffStatus'
import { ShiftHistoryStats } from './ShiftHistoryStats'
import { ShiftHistoryTable } from './ShiftHistoryTable'
import { OnShiftStaffPanel } from './OnShiftStaffPanel'
import { ShiftSettingsPanel } from './ShiftSettingsPanel'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

export function ShiftHistoryTab() {
  const now = new Date()
  
  const [filters, setFilters] = useState<ShiftHistoryFilters>({
    userId: null,
    dateFrom: startOfWeek(now, { weekStartsOn: 1 }),
    dateTo: endOfWeek(now, { weekStartsOn: 1 }),
  })

  const { data: shifts, isLoading } = useShiftHistory(filters)
  const { data: staffList } = useStaffStatus()
  
  const stats = useMemo(() => calculateShiftStats(shifts), [shifts])

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Top section: On-shift staff and Settings side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <OnShiftStaffPanel />
          </div>
          <div>
            <ShiftSettingsPanel />
          </div>
        </div>

        <Separator className="my-4" />

        {/* History section header */}
        <h3 className="text-sm font-medium text-muted-foreground">Lịch sử ca làm việc</h3>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Select
            value={filters.userId || 'all'}
            onValueChange={(value) => 
              setFilters(prev => ({ ...prev, userId: value === 'all' ? null : value }))
            }
          >
            <SelectTrigger className="w-full sm:w-[200px] h-9">
              <SelectValue placeholder="Chọn nhân viên" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nhân viên</SelectItem>
              {staffList?.map((staff) => (
                <SelectItem key={staff.id} value={staff.id}>
                  {staff.full_name || staff.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateRangePicker
            value={{
              from: filters.dateFrom || null,
              to: filters.dateTo || null,
            }}
            onChange={({ from, to }) => 
              setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }))
            }
            className="w-full sm:w-auto"
          />
        </div>

        {/* Stats Cards */}
        <ShiftHistoryStats stats={stats} isLoading={isLoading} />

        {/* Table */}
        <div className="border rounded-lg">
          <ShiftHistoryTable 
            shifts={shifts} 
            isLoading={isLoading}
            showUserColumn={!filters.userId}
          />
        </div>
      </div>
    </ScrollArea>
  )
}
