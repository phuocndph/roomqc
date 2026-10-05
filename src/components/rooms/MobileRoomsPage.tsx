import { useState, useMemo, useEffect, lazy, Suspense } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useRooms } from '@/hooks/useRooms'
import { useAllRoomCheckSessions } from '@/hooks/useRoomCheckSession'
import { usePendingRoomDistributions } from '@/hooks/usePendingRoomDistributions'
import { usePendingTaskCount } from '@/hooks/useHousekeepingTasks'
import { useActiveRoomBookings, minutesUntilCheckout } from '@/hooks/useActiveRoomBookings'
import { useHotelContext } from '@/contexts/HotelContext'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/hooks/useUser'
import { hasPermission } from '@/lib/permissions'
import { canCreateHousekeepingTask } from '@/lib/userAccess'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { RoomQuickViewDialog, type QuickViewEntry } from './RoomQuickViewDialog'
const RoomFloorMapView = lazy(() =>
  import('./RoomFloorMapView').then((module) => ({ default: module.RoomFloorMapView })),
)
import { MobileRoomFilters } from './MobileRoomFilters'
import { MobileRoomBulkActionsBar } from './MobileRoomBulkActionsBar'
import { StaffTasksTab } from '@/components/housekeeping/StaffTasksTab'
import { CreateTaskDialog } from '@/components/housekeeping/CreateTaskDialog'
import { MobileRoomCard } from './mobile/MobileRoomCard'
import { MobileRoomStatsBar } from './mobile/MobileRoomStatsBar'
import { MobileRoomStatusFilterBar, type FilterStatus } from './mobile/MobileRoomStatusFilterBar'
import { Bed, Plus, Search, ClipboardList, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { calcRoomPriority, isOccupiedStatus } from '@/lib/roomPriority'
import type { RoomFilters as IRoomFilters, RoomType, RoomWithStats } from '@/types/rooms.types'

export const MobileRoomsPage = () => {
  const { t } = useTranslation(['rooms', 'common', 'distribution'])
  const navigate = useNavigate()
  const { user } = useAuth()
  const { tenantId, role, user: appUser } = useUser()
  const { selectedHotel } = useHotelContext()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<'rooms' | 'map' | 'tasks'>('rooms')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>(() => {
    const raw = searchParams.get('status')
    if (!raw) return 'all'
    if (raw === 'occupied_clean' || raw === 'occupied_dirty' || raw === 'dnd' || raw === 'sleep_out' || raw === 'skipper' || raw === 'service_refused') return 'occupied'
    if (raw === 'vacant_clean' || raw === 'vacant_inspected') return 'vacant'
    if (raw === 'vacant_dirty') return 'cleaning'
    if (raw === 'out_of_service') return 'maintenance'
    return raw as FilterStatus
  })
  const [search, setSearch] = useState('')

  const [floorFilter, setFloorFilter] = useState<number | undefined>(undefined)
  const [roomTypeFilter, setRoomTypeFilter] = useState<RoomType | undefined>(undefined)
  const [missingItemsOnly, setMissingItemsOnly] = useState(() => searchParams.get('missing') === '1')

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionMode, setSelectionMode] = useState(false)

  const [quickViewEntry, setQuickViewEntry] = useState<QuickViewEntry | null>(null)
  const [taskRoom, setTaskRoom] = useState<{ id: string; number: string; hotelId: string } | null>(null)

  const [filters] = useState<IRoomFilters>({})

  const { data: rooms = [], isLoading, refetch } = useRooms(filters)
  const checkSessions = useAllRoomCheckSessions(tenantId)
  const { data: pendingDistributions } = usePendingRoomDistributions()
  const { data: pendingTaskCount = 0 } = usePendingTaskCount()
  const { data: activeBookings } = useActiveRoomBookings(selectedHotel?.id)

  const canViewRoomDetail = hasPermission(role, 'manage_rooms') || role !== 'staff'
  const canCreateTask = canCreateHousekeepingTask(appUser)

  const matchesStatusGroup = (status: string, filter: FilterStatus) => {
    if (filter === 'occupied') return ['occupied_clean', 'occupied_dirty', 'dnd', 'sleep_out', 'skipper', 'service_refused', 'occupied'].includes(status)
    if (filter === 'vacant') return ['vacant_clean', 'vacant_inspected', 'vacant'].includes(status)
    if (filter === 'cleaning') return ['vacant_dirty', 'cleaning'].includes(status)
    if (filter === 'maintenance') return ['out_of_service', 'maintenance'].includes(status)
    return status === filter
  }

  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const availableFloors = useMemo(() => {
    const floors = [...new Set(rooms.map((r: any) => r.floor).filter(Boolean))]
    return floors.sort((a, b) => a - b)
  }, [rooms])

  const filteredRooms = useMemo(() => {
    return rooms.filter((room: any) => {
      const matchesStatus = statusFilter === 'all' || matchesStatusGroup(room.status, statusFilter)
      const matchesSearch = !search ||
        room.room_number?.toLowerCase().includes(search.toLowerCase()) ||
        room.floor?.toString().includes(search)
      const matchesFloor = floorFilter === undefined || room.floor === floorFilter
      const matchesRoomType = roomTypeFilter === undefined || room.room_type === roomTypeFilter
      const matchesMissingItems = !missingItemsOnly || (room.missing_items && room.missing_items > 0)
      return matchesStatus && matchesSearch && matchesFloor && matchesRoomType && matchesMissingItems
    })
  }, [rooms, statusFilter, search, floorFilter, roomTypeFilter, missingItemsOnly])

  const handleRefresh = async () => { await refetch() }
  const handleClearFilters = () => {
    setFloorFilter(undefined); setRoomTypeFilter(undefined); setMissingItemsOnly(false)
  }
  const toggleSelectRoom = (roomId: string) => {
    setSelectedIds(prev => prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId])
  }
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredRooms.length) setSelectedIds([])
    else setSelectedIds(filteredRooms.map((r: any) => r.id))
  }
  const handleClearSelection = () => { setSelectedIds([]); setSelectionMode(false) }
  const enterSelection = (id: string) => {
    setSelectionMode(true)
    setSelectedIds(prev => prev.includes(id) ? prev : [...prev, id])
  }

  const stats = useMemo(() => ({
    total: rooms.length,
    vacant: rooms.filter((r: any) => matchesStatusGroup(r.status, 'vacant')).length,
    occupied: rooms.filter((r: any) => matchesStatusGroup(r.status, 'occupied')).length,
    check_in: rooms.filter((r: any) => r.status === 'check_in' || r.status === 'occupied_clean').length,
    check_out: rooms.filter((r: any) => r.status === 'check_out' || r.status === 'vacant_dirty').length,
    cleaning: rooms.filter((r: any) => matchesStatusGroup(r.status, 'cleaning')).length,
    maintenance: rooms.filter((r: any) => matchesStatusGroup(r.status, 'maintenance')).length,
    out_of_order: rooms.filter((r: any) => r.status === 'out_of_order').length,
  }), [rooms])

  return (
    <div className={cn("min-h-screen bg-background", selectedIds.length > 0 ? "pb-36" : "pb-20")}>
      <MobileDetailHeader
        title={t('pageTitle')}
        showBack
        rightContent={
          activeTab === 'rooms' ? (
            selectionMode ? (
              <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                {t('selection.cancel')}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setSelectionMode(true)}>
                {t('selection.select')}
              </Button>
            )
          ) : null
        }
      />

      <div className="px-4 pt-2 pb-3">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'rooms' | 'map' | 'tasks')}>
          <TabsList className="w-full">
            <TabsTrigger value="rooms" className="flex-1">
              <Bed className="h-4 w-4 mr-1.5" />
              Lưới HK
            </TabsTrigger>
            <TabsTrigger value="map" className="flex-1">
              <LayoutGrid className="h-4 w-4 mr-1.5" />
              Sơ đồ
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex-1 relative">
              <ClipboardList className="h-4 w-4 mr-1.5" />
              Công việc
              {pendingTaskCount > 0 && (
                <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px]">
                  {pendingTaskCount > 9 ? '9+' : pendingTaskCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-[11px] text-muted-foreground mt-2 px-1">
          {activeTab === 'rooms' && 'Sắp theo ưu tiên. Chạm phòng để xem nhanh. Giữ lâu để chọn nhiều phòng.'}
          {activeTab === 'map' && 'Sơ đồ trạng thái — chạm phòng để xem giá / khách / countdown.'}
          {activeTab === 'tasks' && 'Việc kiểm tra & vệ sinh của bạn theo ca.'}
        </p>
      </div>

      {activeTab === 'tasks' && <StaffTasksTab />}

      {activeTab === 'map' && (
        <div className="px-3 pb-3">
          <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Đang tải sơ đồ phòng…</div>}>
            <RoomFloorMapView onAddRoom={() => navigate('/rooms/new')} />
          </Suspense>
        </div>
      )}

      {activeTab === 'rooms' && (
        <>
          <div className="px-4 pb-3">
            <Button className="w-full" onClick={() => navigate('/rooms/new')}>
              <Plus className="h-4 w-4 mr-2" />
              {t('addNewRoom')}
            </Button>
          </div>

          <MobileRoomStatsBar stats={stats} />

          <div className="px-4 pb-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('filters.searchRoomFloor')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <MobileRoomFilters
              floor={floorFilter}
              roomType={roomTypeFilter}
              missingItemsOnly={missingItemsOnly}
              availableFloors={availableFloors}
              onFloorChange={setFloorFilter}
              onRoomTypeChange={setRoomTypeFilter}
              onMissingItemsOnlyChange={setMissingItemsOnly}
              onClear={handleClearFilters}
            />
          </div>

          {selectionMode && (
            <div className="px-4 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedIds.length === filteredRooms.length && filteredRooms.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedIds.length > 0
                    ? t('selection.selected', { count: selectedIds.length, total: filteredRooms.length })
                    : t('selection.selectAll')}
                </span>
              </div>
            </div>
          )}

          <MobileRoomStatusFilterBar value={statusFilter} onChange={setStatusFilter} />

          <PullToRefresh onRefresh={handleRefresh}>
            <div className="p-4 space-y-3">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4">
                      <div className="h-32 bg-muted rounded" />
                    </CardContent>
                  </Card>
                ))
              ) : filteredRooms.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Bed className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {search ? t('messages.notFound') : t('messages.noRooms')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredRooms.map((room: RoomWithStats) => {
                  const session = checkSessions[room.id]
                  const pendingCount = pendingDistributions?.get(room.id) || 0
                  const booking = activeBookings?.get(room.id) || null
                  const now = new Date(nowTick)
                  const mins = booking && isOccupiedStatus(room.status)
                    ? minutesUntilCheckout(booking, now)
                    : null
                  const priority = calcRoomPriority(room, { pendingDistributions: pendingCount, minutesToCheckout: mins })

                  return (
                    <MobileRoomCard
                      key={room.id}
                      room={room}
                      isSelected={selectedIds.includes(room.id)}
                      selectionMode={selectionMode}
                      session={session}
                      pendingCount={pendingCount}
                      priorityTier={priority.tier}
                      priorityReason={priority.reason}
                      currentUserId={user?.id}
                      onToggleSelect={toggleSelectRoom}
                      onEnterSelection={enterSelection}
                      onOpenQuickView={() => setQuickViewEntry({
                        room,
                        pendingCount,
                        priority: { tier: priority.tier, reason: priority.reason, daysSinceCheck: priority.daysSinceCheck },
                        booking,
                        minutesToCheckout: mins,
                        session: session ?? null,
                      })}
                    />
                  )
                })
              )}
            </div>
          </PullToRefresh>

          <MobileRoomBulkActionsBar
            selectedIds={selectedIds}
            onClearSelection={handleClearSelection}
            rooms={filteredRooms.map((r: any) => ({ id: r.id, room_number: r.room_number, hotel_id: r.hotel_id }))}
          />
        </>
      )}

      <RoomQuickViewDialog
        open={!!quickViewEntry}
        onOpenChange={(open) => !open && setQuickViewEntry(null)}
        entry={quickViewEntry}
        canViewRoomDetail={canViewRoomDetail}
        canCreateTask={canCreateTask}
        currentUserId={user?.id}
        onOpenCreateTask={(room) => setTaskRoom({ id: room.id, number: room.room_number, hotelId: room.hotel_id })}
      />

      {taskRoom && (
        <CreateTaskDialog
          open={!!taskRoom}
          onOpenChange={(open) => !open && setTaskRoom(null)}
          roomId={taskRoom.id}
          roomNumber={taskRoom.number}
          hotelId={taskRoom.hotelId}
          defaultTaskType="cleaning"
        />
      )}
    </div>
  )
}
