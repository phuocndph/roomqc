import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Clock, ClipboardList, Bed, ChevronRight, AlertCircle, AlertTriangle, CheckCircle2, RotateCcw, DoorOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PageHeader } from '@/components/shared/PageHeader'
import { CheckTypeSelector } from './CheckTypeSelector'
import { CleaningCompleteDialog } from './CleaningCompleteDialog'
import { StaffTasksTab } from '@/components/housekeeping/StaffTasksTab'
import { useRooms } from '@/hooks/useRooms'
import { useRoomLastCheck } from '@/hooks/useRoomLastCheck'
import { useAllRoomCheckSessions, getSessionDurationMinutes, formatSessionDuration } from '@/hooks/useRoomCheckSession'
import { usePendingTaskCount } from '@/hooks/useHousekeepingTasks'
import { useUser } from '@/hooks/useUser'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { RoomFilters, RoomStatus } from '@/types/rooms.types'

// Status config with semantic colors
const STATUS_CONFIG: Partial<Record<RoomStatus, { label: string; color: string; bgColor: string }>> = {
  vacant: { label: 'Trống', color: 'text-green-600', bgColor: 'bg-green-100' },
  occupied: { label: 'Đang ở', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  cleaning: { label: 'Dọn', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  maintenance: { label: 'Bảo trì', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  out_of_order: { label: 'Hỏng', color: 'text-red-600', bgColor: 'bg-red-100' },
  check_in: { label: 'Check-in', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  check_out: { label: 'Check-out', color: 'text-purple-600', bgColor: 'bg-purple-100' },
}

// Filter chips for quick filtering
const FILTER_CHIPS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'check_needed', label: 'Cần kiểm tra' },
  { value: 'check_out', label: 'Check-out' },
  { value: 'vacant', label: 'Trống' },
  { value: 'cleaning', label: 'Đang dọn' },
  { value: 'occupied', label: 'Đang ở' },
] as const

type FilterValue = typeof FILTER_CHIPS[number]['value']

export function StaffRoomCheckView() {
  const navigate = useNavigate()
  const { tenantId } = useUser()
  const [activeTab, setActiveTab] = useState<'rooms' | 'tasks'>('rooms')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all')
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [selectedRoomNumber, setSelectedRoomNumber] = useState<string>('')
  const [showCheckSelector, setShowCheckSelector] = useState(false)
  const [showCleaningComplete, setShowCleaningComplete] = useState(false)
  
  const { data: rooms, isLoading } = useRooms({})
  const checkSessions = useAllRoomCheckSessions(tenantId)
  const { data: pendingTaskCount = 0 } = usePendingTaskCount()

  // Apply filters
  const filteredRooms = rooms?.filter(room => {
    // Search filter
    if (search && !room.room_number.toLowerCase().includes(search.toLowerCase())) {
      return false
    }
    
    // Status filter
    if (activeFilter === 'all') return true
    if (activeFilter === 'check_needed') {
      return room.status === 'vacant' || room.status === 'cleaning' || room.status === 'check_out'
    }
    return room.status === activeFilter
  }) || []

  // Group rooms by floor
  const roomsByFloor = filteredRooms.reduce((acc, room) => {
    const floor = room.floor || 1
    if (!acc[floor]) acc[floor] = []
    acc[floor].push(room)
    return acc
  }, {} as Record<number, typeof filteredRooms>)

  const handleStartCheck = (roomId: string, roomStatus?: string) => {
    // Auto-navigate khi phong cleaning/check_out - khong can hoi loai kiem tra
    if (roomStatus === 'cleaning') {
      navigate(`/rooms/${roomId}/check?type=daily`)
      return
    }
    if (roomStatus === 'check_out') {
      navigate(`/rooms/${roomId}/check?type=checkout`)
      return
    }
    // Chi hien modal chon loai cho phong vacant hoac cac trang thai khac
    setSelectedRoomId(roomId)
    setShowCheckSelector(true)
  }

  const handleCleaningComplete = (roomId: string, roomNumber: string) => {
    setSelectedRoomId(roomId)
    setSelectedRoomNumber(roomNumber)
    setShowCleaningComplete(true)
  }

  const handleRecheck = (roomId: string) => {
    // Navigate directly to room check page with daily type
    navigate(`/rooms/${roomId}/check?type=daily`)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kiểm tra phòng"
        description="Chọn phòng để kiểm tra"
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'rooms' | 'tasks')}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="rooms" className="gap-2">
            <Bed className="h-4 w-4" />
            Phòng
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2 relative">
            <ClipboardList className="h-4 w-4" />
            Việc cần làm
            {pendingTaskCount > 0 && (
              <Badge 
                variant="destructive" 
                className="ml-1 h-5 min-w-5 px-1 text-xs"
              >
                {pendingTaskCount > 9 ? '9+' : pendingTaskCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4">
          <StaffTasksTab />
        </TabsContent>

        <TabsContent value="rooms" className="mt-4 space-y-4">
          {/* Compact Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm phòng..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* Filter Chips - Horizontal Scroll */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
            {FILTER_CHIPS.map((chip) => (
              <Button
                key={chip.value}
                type="button"
                variant={activeFilter === chip.value ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-3 text-xs whitespace-nowrap flex-shrink-0"
                onClick={() => setActiveFilter(chip.value)}
              >
                {chip.label}
                {chip.value === 'check_out' && (
                  <span className="ml-1 text-[10px] opacity-70">
                    ({rooms?.filter(r => r.status === 'check_out').length || 0})
                  </span>
                )}
                {chip.value === 'check_needed' && (
                  <span className="ml-1 text-[10px] opacity-70">
                    ({rooms?.filter(r => r.status === 'vacant' || r.status === 'cleaning').length || 0})
                  </span>
                )}
              </Button>
            ))}
          </div>

          {/* Compact Room List */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Bed className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Không có phòng nào</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(roomsByFloor)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([floor, floorRooms]) => (
                  <div key={floor}>
                    {/* Floor header */}
                    <div className="text-xs font-medium text-muted-foreground mb-1.5 px-1">
                      Tầng {floor} ({floorRooms.length})
                    </div>
                    
                    {/* Room rows */}
                    <div className="border rounded-lg overflow-hidden divide-y">
                      {floorRooms.map((room) => (
                        <CompactRoomRow
                          key={room.id}
                          room={room}
                          checkSession={checkSessions[room.id]}
                          onStartCheck={handleStartCheck}
                          onCleaningComplete={handleCleaningComplete}
                          onRecheck={handleRecheck}
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Check Type Selector Modal */}
      {selectedRoomId && (
        <CheckTypeSelector
          open={showCheckSelector}
          onOpenChange={setShowCheckSelector}
          roomId={selectedRoomId}
          roomNumber={rooms?.find(r => r.id === selectedRoomId)?.room_number || ''}
        />
      )}

      {/* Cleaning Complete Dialog */}
      {selectedRoomId && (
        <CleaningCompleteDialog
          open={showCleaningComplete}
          onOpenChange={setShowCleaningComplete}
          roomId={selectedRoomId}
          roomNumber={selectedRoomNumber}
        />
      )}
    </div>
  )
}

interface CompactRoomRowProps {
  room: any
  checkSession?: any
  onStartCheck: (roomId: string, roomStatus?: string) => void
  onCleaningComplete: (roomId: string, roomNumber: string) => void
  onRecheck: (roomId: string) => void
}

function CompactRoomRow({ room, checkSession, onStartCheck, onCleaningComplete, onRecheck }: CompactRoomRowProps) {
  const navigate = useNavigate()
  const { data: lastCheck, isLoading } = useRoomLastCheck(room.id)
  const statusConfig = STATUS_CONFIG[room.status as RoomStatus] || STATUS_CONFIG.vacant
  const isCleaning = room.status === 'cleaning'
  const isCheckOut = room.status === 'check_out'
  const isCheckable = room.status === 'vacant' || isCleaning || isCheckOut
  const hasSession = !!checkSession
  const hasIssues = lastCheck && !lastCheck.items_complete
  
  // Calculate session duration
  const sessionDuration = hasSession ? getSessionDurationMinutes(checkSession.started_at) : 0

  return (
    <div 
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 bg-background transition-colors",
        isCheckable && !hasSession && !isCleaning && "hover:bg-muted/50 cursor-pointer active:bg-muted",
        hasSession && "bg-amber-50/50"
      )}
      onClick={() => {
        if (room.status === 'vacant' && !hasSession) {
          onStartCheck(room.id, room.status)
        }
      }}
    >
      {/* Room number */}
      <div className="w-12 flex-shrink-0">
        <span className="text-base font-semibold">{room.room_number}</span>
      </div>

      {/* Status badge */}
      <Badge 
        variant="secondary" 
        className={cn(
          "h-5 px-1.5 text-[10px] font-medium flex-shrink-0",
          statusConfig.bgColor,
          statusConfig.color
        )}
      >
        {statusConfig.label}
      </Badge>

      {/* Middle info */}
      <div className="flex-1 min-w-0 text-xs text-muted-foreground">
        {hasSession ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center gap-1",
                  sessionDuration > 40 ? "text-destructive" : "text-amber-600"
                )}>
                  {sessionDuration > 40 ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3 animate-pulse" />
                  )}
                  <span className="truncate">{checkSession.user_name}</span>
                  <span className="text-[10px] opacity-70">
                    ({formatSessionDuration(sessionDuration)})
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  Bắt đầu lúc {new Date(checkSession.started_at).toLocaleTimeString('vi-VN')}
                  {sessionDuration > 40 && (
                    <span className="block text-destructive">⚠️ Có thể bị quên chưa hoàn thành</span>
                  )}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : lastCheck ? (
          <div className="flex items-center gap-1">
            {hasIssues && <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />}
            <span className="truncate">
              {formatDistanceToNow(new Date(lastCheck.checked_at), {
                addSuffix: false,
                locale: vi,
              })}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground/60">Chưa kiểm tra</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Check-out room: Show "Kiểm tra checkout" button */}
        {isCheckOut && !hasSession && (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-7 px-2 text-xs gap-1 bg-purple-600 hover:bg-purple-700"
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/rooms/${room.id}/check?type=checkout`)
            }}
          >
            <ClipboardList className="h-3 w-3" />
            <span className="hidden sm:inline">Kiểm tra</span>
          </Button>
        )}

        {/* Cleaning room: Show "Hoàn thành" and "Kiểm tra lại" buttons */}
        {isCleaning && !hasSession && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={(e) => {
                e.stopPropagation()
                onRecheck(room.id)
              }}
            >
              <RotateCcw className="h-3 w-3" />
              <span className="hidden sm:inline">Kiểm tra</span>
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={(e) => {
                e.stopPropagation()
                onCleaningComplete(room.id, room.room_number)
              }}
            >
              <CheckCircle2 className="h-3 w-3" />
              <span className="hidden sm:inline">Xong</span>
            </Button>
          </>
        )}

        {/* Occupied room: Show daily check button */}
        {room.status === 'occupied' && !hasSession && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={(e) => {
              e.stopPropagation()
              onStartCheck(room.id, room.status)
            }}
          >
            <ClipboardList className="h-3 w-3" />
            <span className="hidden sm:inline">Kiểm tra</span>
          </Button>
        )}

        {/* Vacant room without session: Show arrow */}
        {room.status === 'vacant' && !hasSession && (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}

        {/* Session active badge */}
        {hasSession && (
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] h-5",
              sessionDuration > 40 
                ? "border-destructive text-destructive" 
                : "border-amber-500 text-amber-600"
            )}
          >
            {sessionDuration > 40 ? "Quá hạn" : "Đang KT"}
          </Badge>
        )}
      </div>
    </div>
  )
}
