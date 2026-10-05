import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Bed, ClipboardCheck, AlertCircle } from 'lucide-react'
import { PullToRefresh } from '@/components/mobile/TouchOptimized'
import { SwipeableCard } from '@/components/mobile/TouchOptimized'
import { Badge } from '@/components/ui/badge'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { useRooms, useRoomStats } from '@/hooks/useRooms'
import { useUser } from '@/hooks/useUser'
import { useQueryClient } from '@tanstack/react-query'
import type { RoomStatus } from '@/types/rooms.types'

const statusLabels = {
  vacant: 'Trống',
  occupied: 'Đang ở',
  check_in: 'Check In',
  check_out: 'Check Out',
  cleaning: 'Đang dọn',
  maintenance: 'Bảo trì',
  out_of_order: 'Ngừng',
} as const

const statusTextColors = {
  vacant: 'text-green-600 dark:text-green-400',
  occupied: 'text-blue-600 dark:text-blue-400',
  check_in: 'text-cyan-600 dark:text-cyan-400',
  check_out: 'text-orange-600 dark:text-orange-400',
  cleaning: 'text-amber-600 dark:text-amber-400',
  maintenance: 'text-destructive',
  out_of_order: 'text-muted-foreground',
} as const

export function MobileRoomsDashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useUser()
  const [statusFilter, setStatusFilter] = useState<RoomStatus | 'all'>('all')
  
  const { data: rooms, isLoading } = useRooms(
    statusFilter === 'all' ? {} : { status: statusFilter }
  )
  const { data: stats } = useRoomStats(user?.tenant_id, user?.hotel_id)

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['rooms'] })
    await queryClient.invalidateQueries({ queryKey: ['room-stats'] })
  }

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-4 pb-20">
        {/* Stats - Horizontal scroll */}
        <div className="px-4 pt-2">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {[
              { key: 'vacant', label: 'Trống', count: stats?.vacant || 0 },
              { key: 'occupied', label: 'Đang ở', count: stats?.occupied || 0 },
              { key: 'check_in', label: 'Check In', count: stats?.check_in || 0 },
              { key: 'check_out', label: 'Check Out', count: stats?.check_out || 0 },
              { key: 'cleaning', label: 'Đang dọn', count: stats?.cleaning || 0 },
              { key: 'maintenance', label: 'Bảo trì', count: stats?.maintenance || 0 },
            ].map((stat) => (
              <button
                key={stat.key}
                onClick={() => setStatusFilter(stat.key as RoomStatus)}
                className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-lg border transition-colors ${
                  statusFilter === stat.key ? 'ring-2 ring-primary bg-muted/30' : 'hover:bg-muted/50'
                }`}
              >
                <span className={`text-lg font-bold ${statusTextColors[stat.key as RoomStatus]}`}>
                  {stat.count}
                </span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{stat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Actions - Icon only, permission protected */}
        <div className="px-4 flex gap-2">
          <PermissionGate module="rooms" action="create">
            <button
              onClick={() => navigate('/rooms/new')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg hover:bg-muted/50"
            >
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span>Thêm</span>
            </button>
          </PermissionGate>
            <button
            onClick={() => navigate('/rooms?view=grid&status=vacant_dirty')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg hover:bg-muted/50"
          >
            <ClipboardCheck className="h-3.5 w-3.5 text-primary" />
            <span>Kiểm tra</span>
          </button>
          {statusFilter !== 'all' && (
            <button
              onClick={() => setStatusFilter('all')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg hover:bg-muted/50 ml-auto"
            >
              <Bed className="h-3.5 w-3.5" />
              <span>Tất cả</span>
            </button>
          )}
        </div>

        {/* Rooms List - Compact */}
        <div className="px-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            {rooms?.length || 0} phòng
            {statusFilter !== 'all' && ` • ${statusLabels[statusFilter]}`}
          </p>
          
          {rooms?.map((room) => (
            <SwipeableCard
              key={room.id}
              onSwipeLeft={() => navigate(`/rooms/${room.id}`)}
              onSwipeRight={() => navigate(`/rooms/${room.id}/check`)}
            >
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium">P{room.room_number}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        T{room.floor} • {room.room_type}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(room.missing_items > 0 || room.items_in_laundry > 0) && (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    )}
                    <Badge variant="subtle" className={statusTextColors[room.status as RoomStatus]}>
                      {statusLabels[room.status as keyof typeof statusLabels]}
                    </Badge>
                  </div>
                </div>
              </div>
            </SwipeableCard>
          ))}
        </div>

        {/* Empty State */}
        {(!rooms || rooms.length === 0) && (
          <div className="px-4 py-8 text-center">
            <Bed className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {statusFilter === 'all' 
                ? 'Chưa có phòng nào'
                : `Không có phòng ${statusLabels[statusFilter]}`
              }
            </p>
          </div>
        )}
      </div>
    </PullToRefresh>
  )
}
