import { Users, Clock } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useOnShiftStaffListAll, type OnShiftStaffMember } from '@/hooks/useOnShiftStaffListAll'
import { useShiftSettings } from '@/hooks/useShiftSettings'
import { LiveShiftDuration, ShiftStatusIndicator } from './LiveShiftDuration'
import { getShiftStatus } from '@/hooks/useShiftTimer'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { differenceInMinutes } from 'date-fns'

export function OnShiftStaffPanel() {
  const { data: staffList, isLoading } = useOnShiftStaffListAll()
  const { data: settings } = useShiftSettings()

  const warningHours = settings?.warning_hours ?? 8
  const maxHours = settings?.max_shift_hours ?? 10

  if (isLoading) {
    return (
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-5 w-32" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const count = staffList?.length || 0

  return (
    <div className="border rounded-lg">
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-medium text-sm">Đang trong ca</h3>
        </div>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
          {count} người
        </span>
      </div>

      {count === 0 ? (
        <div className="p-6 text-center text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Không có nhân viên đang trong ca</p>
        </div>
      ) : (
        <ScrollArea className="h-[280px]">
          <div className="divide-y">
            {staffList?.map(staff => (
              <OnShiftStaffItem
                key={staff.id}
                staff={staff}
                warningHours={warningHours}
                maxHours={maxHours}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

interface OnShiftStaffItemProps {
  staff: OnShiftStaffMember
  warningHours: number
  maxHours: number
}

function OnShiftStaffItem({ staff, warningHours, maxHours }: OnShiftStaffItemProps) {
  const totalMinutes = staff.shift_start_at
    ? differenceInMinutes(new Date(), new Date(staff.shift_start_at))
    : 0
  const status = getShiftStatus(totalMinutes, warningHours, maxHours)

  const startTime = staff.shift_start_at
    ? format(new Date(staff.shift_start_at), 'HH:mm', { locale: vi })
    : '--:--'

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarImage src={staff.avatar_url || undefined} />
          <AvatarFallback className="text-xs">
            {staff.full_name?.charAt(0)?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <ShiftStatusIndicator
          status={status}
          className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{staff.full_name}</p>
          {staff.hotel_name && (
            <span className="text-xs text-muted-foreground truncate">
              • {staff.hotel_name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Vào ca: {startTime}</span>
          <span>•</span>
          <LiveShiftDuration
            shiftStartAt={staff.shift_start_at}
            warningHours={warningHours}
            maxHours={maxHours}
            showIcon={false}
            className="text-xs"
          />
        </div>
      </div>
    </div>
  )
}
