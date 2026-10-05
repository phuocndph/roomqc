import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StaffCard } from './StaffCard'
import { Skeleton } from '@/components/ui/skeleton'
import type { StaffWithStatus } from '@/hooks/useStaffStatus'
import type { PresenceFilterKey } from './StaffStatsCards'
import { PRESENCE_SORT_ORDER, type StaffPresenceState } from '@/lib/staffPresence'

interface StaffListProps {
  staff: StaffWithStatus[] | undefined
  isLoading: boolean
  filterStatus: PresenceFilterKey | null
  onViewDetail?: (staff: StaffWithStatus) => void
}

const FILTER_TO_STATES: Record<PresenceFilterKey, StaffPresenceState[]> = {
  available: ['on_shift_available'],
  busy: ['on_shift_busy'],
  disconnected: ['on_shift_offline'],
  off_shift: ['shift_stale', 'not_on_shift'],
}

export function StaffList({ staff, isLoading, filterStatus, onViewDetail }: StaffListProps) {
  const [search, setSearch] = useState('')

  const filteredStaff = useMemo(() => {
    if (!staff) return []

    let result = staff

    if (filterStatus) {
      const allowed = new Set(FILTER_TO_STATES[filterStatus])
      result = result.filter(s => allowed.has(s.presence_state))
    }

    if (search.trim()) {
      const searchLower = search.toLowerCase()
      result = result.filter(s =>
        s.full_name.toLowerCase().includes(searchLower) ||
        s.email.toLowerCase().includes(searchLower) ||
        s.position_name?.toLowerCase().includes(searchLower) ||
        s.phone?.includes(search)
      )
    }

    // Sort by unified presence order, then by name
    result = [...result].sort((a, b) => {
      const diff = PRESENCE_SORT_ORDER[a.presence_state] - PRESENCE_SORT_ORDER[b.presence_state]
      if (diff !== 0) return diff
      return a.full_name.localeCompare(b.full_name, 'vi')
    })

    return result
  }, [staff, filterStatus, search])

  if (isLoading) {
    return (
      <div className="space-y-1 p-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên, email, SĐT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {filteredStaff.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">Không tìm thấy nhân viên</p>
          </div>
        ) : (
          <div>
            {filteredStaff.map(s => (
              <StaffCard key={s.id} staff={s} onViewDetail={onViewDetail} />
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="p-2 border-t text-xs text-muted-foreground text-center">
        {filteredStaff.length} nhân viên
      </div>
    </div>
  )
}
