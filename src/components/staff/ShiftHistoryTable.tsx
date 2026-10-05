import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDuration, type ShiftHistoryRecord } from '@/hooks/useShiftHistory'

interface ShiftHistoryTableProps {
  shifts: ShiftHistoryRecord[] | undefined
  isLoading?: boolean
  showUserColumn?: boolean
}

export function ShiftHistoryTable({ shifts, isLoading, showUserColumn = true }: ShiftHistoryTableProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Đang tải...
      </div>
    )
  }

  if (!shifts || shifts.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Không có dữ liệu ca làm việc
      </div>
    )
  }

  return (
    <ScrollArea className="h-[400px]">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 sticky top-0">
          <tr className="border-b">
            {showUserColumn && (
              <th className="text-left p-3 font-medium">Nhân viên</th>
            )}
            <th className="text-left p-3 font-medium">Ngày</th>
            <th className="text-left p-3 font-medium">Vào ca</th>
            <th className="text-left p-3 font-medium">Ra ca</th>
            <th className="text-right p-3 font-medium">Thời gian</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift) => (
            <tr key={shift.id} className="border-b hover:bg-muted/30">
              {showUserColumn && (
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={shift.user?.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">
                        {shift.user?.full_name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate max-w-[120px]">
                      {shift.user?.full_name || 'N/A'}
                    </span>
                  </div>
                </td>
              )}
              <td className="p-3 text-muted-foreground">
                {format(new Date(shift.start_at), 'dd/MM/yyyy', { locale: vi })}
              </td>
              <td className="p-3 font-mono text-xs">
                {format(new Date(shift.start_at), 'HH:mm', { locale: vi })}
              </td>
              <td className="p-3 font-mono text-xs">
                {format(new Date(shift.end_at), 'HH:mm', { locale: vi })}
              </td>
              <td className="p-3 text-right font-medium text-green-600">
                {formatDuration(shift.duration_minutes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  )
}
