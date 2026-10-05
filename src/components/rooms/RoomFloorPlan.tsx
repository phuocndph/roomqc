import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { useFloorPlan } from '@/hooks/useFloorPlan'
import { cn } from '@/lib/utils'
import { Building2 } from 'lucide-react'
import { getRoomStatusMeta, ROOM_STATUS_V2_LIST, normalizeRoomStatus } from '@/lib/roomStatus'

export function RoomFloorPlan() {
  const { t } = useTranslation(['rooms'])
  const navigate = useNavigate()
  const { data: floorPlan, isLoading } = useFloorPlan()

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="border rounded-lg p-3">
            <Skeleton className="h-5 w-24 mb-3" />
            <div className="flex gap-2 flex-wrap">
              {[...Array(8)].map((_, j) => (
                <Skeleton key={j} className="h-16 w-20" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!floorPlan || Object.keys(floorPlan).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">{t('floorPlan.noData')}</p>
      </div>
    )
  }

  const floors = Object.keys(floorPlan).sort((a, b) => parseInt(b) - parseInt(a))
  const totalRooms = floors.reduce((acc, floor) => acc + floorPlan[floor].length, 0)
  const statusCounts = floors.reduce((acc, floor) => {
    floorPlan[floor].forEach(room => {
      const v = normalizeRoomStatus(room.status)
      acc[v] = (acc[v] || 0) + 1
    })
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-4">
      {/* Legend & Summary */}
      <div className="border rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{t('floorPlan.statusLegend')}</span>
          <span className="text-xs text-muted-foreground">
            {t('floorPlan.totalRooms', { count: totalRooms })}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {ROOM_STATUS_V2_LIST.map((key) => {
            const count = statusCounts[key] || 0
            const meta = getRoomStatusMeta(key)
            return (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                <span className={cn("w-2 h-2 rounded-full", meta.bg, "border", meta.border)} />
                <span className={meta.text}>{meta.label}</span>
                <span className="text-muted-foreground">({count})</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Floor Plans */}
      {floors.map((floor) => {
        const rooms = floorPlan[floor]
        return (
          <div key={floor} className="border rounded-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {t('floorPlan.floor', { number: floor })}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({rooms.length} {t('floorPlan.rooms')})
                </span>
              </div>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                {rooms.map((room) => {
                  const meta = getRoomStatusMeta(room.status)
                  return (
                    <button
                      key={room.id}
                      onClick={() => navigate(`/rooms/${room.id}`)}
                      className={cn(
                        "relative flex flex-col items-center p-2 rounded-lg border transition-all",
                        "hover:bg-muted/50 hover:shadow-sm active:scale-95",
                        meta.border
                      )}
                    >
                      <span className={cn("absolute top-1 right-1 w-2 h-2 rounded-full", meta.bg, "border", meta.border)} />
                      <span className="text-sm font-semibold">{room.room_number}</span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-full">
                        {t(`roomTypes.${room.room_type}`, { defaultValue: room.room_type })}
                      </span>
                      <div className={cn("flex items-center gap-0.5 mt-0.5", meta.text)}>
                        <span className="text-[9px]">{meta.short}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
