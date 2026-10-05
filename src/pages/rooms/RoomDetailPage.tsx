import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ClipboardCheck, Edit, Gift, History, MoreHorizontal, Printer, RefreshCw, RotateCcw, Wrench } from 'lucide-react'
import { format, isValid } from 'date-fns'
import { RoomAuditLogDialog } from '@/components/rooms/RoomAuditLogDialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RoomStatusBadge } from '@/components/rooms/RoomStatusBadge'
import { StaffRoomDetailPage } from '@/components/rooms/StaffRoomDetailPage'
import { RoomSupplementSheet } from '@/components/rooms/RoomSupplementSheet'
import { RoomDistributionHistory } from '@/components/rooms/RoomDistributionHistory'
import { EnhancedCheckHistory } from '@/components/rooms/EnhancedCheckHistory'
import { CreateTaskDialog } from '@/components/housekeeping/CreateTaskDialog'
import { CleaningRequestBanner } from '@/components/rooms/CleaningRequestBanner'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { useRoom } from '@/hooks/useRooms'
import { navigateBack } from '@/lib/navigation'
import { useApplyStandards } from '@/hooks/useRoomStandards'
import { useSetupRoom } from '@/hooks/useSetupRoom'
import { useUser } from '@/hooks/useUser'
import { useBreakpoint } from '@/lib/breakpoints'
import { canCreateHousekeepingTask } from '@/lib/userAccess'
import { formatCurrency } from '@/lib/utils'
import { PermissionGate } from '@/components/auth/PermissionGate'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PanelGuestBooking } from '@/components/rooms/detail/PanelGuestBooking'
import { PanelAssetStatus } from '@/components/rooms/detail/PanelAssetStatus'
import { PanelPerformance } from '@/components/rooms/detail/PanelPerformance'
import { PanelItems } from '@/components/rooms/detail/PanelItems'
import type { RoomStatus } from '@/types/rooms.types'

export function RoomDetailPage() {
  const { isMobile } = useBreakpoint()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useRoom(id)
  const applyStandards = useApplyStandards()
  const setupRoom = useSetupRoom()
  const { user, isLoading: userLoading } = useUser()
  const tabsRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [deliverySections, setDeliverySections] = useState<string[]>([])
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [showAuditLog, setShowAuditLog] = useState(false)
  const [showSupplement, setShowSupplement] = useState(false)
  const [supplementMode, setSupplementMode] = useState<'missing' | 'extra'>('missing')
  const canCreateTask = canCreateHousekeepingTask(user)

  useEffect(() => {
    setActiveTab('overview')
    setDeliverySections([])
  }, [id])

  if (isMobile && !userLoading && !canCreateTask) return <StaffRoomDetailPage />
  if (isLoading) return <RoomDetailSkeleton />

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold">Không tìm thấy phòng</h1>
        <Button onClick={() => navigateBack(navigate, '/rooms')} className="mt-4">Về danh sách</Button>
      </div>
    )
  }

  const { room, items, recent_checks: checks } = data
  const missingCount = items.filter((item) => item.has_standard && item.missing_quantity > 0).length
  const lastCheck = checks[0]
  const lastCheckDate = lastCheck ? new Date(lastCheck.checked_at) : null

  const changeTab = (value: string) => {
    setActiveTab(value)
    tabsRef.current?.scrollIntoView({ block: 'nearest' })
  }

  const openSupplement = (mode: 'missing' | 'extra' = 'missing') => {
    setSupplementMode(mode)
    setShowSupplement(true)
  }

  const content = (
    <div className="mx-auto w-full min-w-0 max-w-5xl px-4 pt-4 pb-24 lg:px-0 lg:pt-0 lg:pb-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Về danh sách phòng" onClick={() => navigateBack(navigate, '/rooms')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Về danh sách phòng</TooltipContent>
          </Tooltip>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="whitespace-nowrap text-2xl font-semibold">Phòng {room.room_number}</h1>
              <RoomStatusBadge status={room.status as RoomStatus} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{room.room_type.charAt(0).toUpperCase() + room.room_type.slice(1)} · Tầng {room.floor}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button className="h-10" onClick={() => navigate(`/rooms/${id}/check`)}>
            <ClipboardCheck className="mr-2 h-4 w-4" />Kiểm tra phòng
          </Button>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Thao tác khác">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Thao tác khác</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {canCreateTask && (
                <DropdownMenuItem onSelect={() => setShowCreateTask(true)}>
                  <Wrench className="mr-2 h-4 w-4" />Yêu cầu công việc
                </DropdownMenuItem>
              )}
              <PermissionGate module="rooms" action="update">
                <DropdownMenuItem onSelect={() => navigate(`/rooms/${id}/edit`)}>
                  <Edit className="mr-2 h-4 w-4" />Sửa thông tin phòng
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openSupplement('extra')}>
                  <Gift className="mr-2 h-4 w-4" />Thêm đồ ngoài tiêu chuẩn
                </DropdownMenuItem>
                <DropdownMenuItem disabled={applyStandards.isPending} onSelect={() => applyStandards.mutate(id!)}>
                  <RefreshCw className="mr-2 h-4 w-4" />Đồng bộ tiêu chuẩn đồ dùng
                </DropdownMenuItem>
              </PermissionGate>
              <DropdownMenuItem onSelect={() => setShowAuditLog(true)}>
                <History className="mr-2 h-4 w-4" />Nhật ký thay đổi
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />In thông tin phòng
              </DropdownMenuItem>
              <PermissionGate module="rooms" action="update">
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={setupRoom.isPending} onSelect={() => setShowResetDialog(true)}>
                  <RotateCcw className="mr-2 h-4 w-4" />Đặt lại đồ dùng theo tiêu chuẩn
                </DropdownMenuItem>
              </PermissionGate>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {['cleaning', 'occupied_dirty', 'vacant_dirty'].includes(room.status as string) && (
        <div className="mb-4">
          <CleaningRequestBanner roomId={id!} roomNumber={room.room_number} hotelId={room.hotel_id} />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={changeTab} ref={tabsRef}>
        <TabsList className="grid h-11 w-full grid-cols-3 gap-0 rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="overview" className="h-11 rounded-none border-b-2 border-transparent text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">
            Tổng quan
          </TabsTrigger>
          <TabsTrigger value="items" className="h-11 gap-2 rounded-none border-b-2 border-transparent text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">
            Đồ dùng
            {missingCount > 0 && <span className="text-xs text-amber-700 dark:text-amber-400">({missingCount} thiếu)</span>}
          </TabsTrigger>
          <TabsTrigger value="history" className="h-11 rounded-none border-b-2 border-transparent text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">
            Lịch sử
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <PanelGuestBooking roomId={id!} hotelId={room.hotel_id} tenantId={room.tenant_id} roomNumber={room.room_number} />
          <PanelAssetStatus
            roomId={id!}
            items={items}
            onViewItems={() => changeTab('items')}
            onRequestSupplement={() => openSupplement()}
            onViewDelivery={() => {
              setDeliverySections(['deliveries'])
              changeTab('items')
            }}
          />
          <section className="flex flex-wrap items-center justify-between gap-3 border-b py-5" aria-label="Kiểm tra gần nhất">
            <div>
              <h2 className="text-sm text-muted-foreground">Kiểm tra gần nhất</h2>
              <p className="mt-1 text-sm font-medium">
                {lastCheck
                  ? `${lastCheckDate && isValid(lastCheckDate) ? format(lastCheckDate, 'dd/MM/yyyy HH:mm') : 'Chưa rõ ngày'} · ${lastCheck.checked_by_name || 'Chưa rõ nhân viên'}`
                  : 'Chưa kiểm tra phòng'}
              </p>
              {lastCheck?.cleanliness_score != null && (
                <p className="mt-1 text-sm text-muted-foreground">Điểm sạch sẽ: {lastCheck.cleanliness_score}/5</p>
              )}
            </div>
            {lastCheck && <Button variant="ghost" size="sm" onClick={() => changeTab('history')}><History className="mr-2 h-4 w-4" />Xem lịch sử</Button>}
          </section>

          <Accordion type="multiple">
            <AccordionItem value="room-info">
              <AccordionTrigger className="text-sm">Thông tin phòng</AccordionTrigger>
              <AccordionContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
                  {[
                    ['Loại phòng', room.room_type],
                    ['Tầng', String(room.floor)],
                    ['Giường', room.bed_type || 'Chưa thiết lập'],
                    ['Diện tích', room.area_sqm ? `${room.area_sqm} m²` : 'Chưa thiết lập'],
                    ['Số khách tối đa', String(room.max_guests || 0)],
                    ['Giá cơ bản / đêm', formatCurrency(room.base_price || 0)],
                    ...(room.view_type ? [['Hướng nhìn', room.view_type]] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-sm text-muted-foreground">{label}</dt>
                      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                {room.amenities && room.amenities.length > 0 && <p className="mt-5 text-sm"><span className="text-muted-foreground">Tiện nghi: </span>{room.amenities.join(', ')}</p>}
                {room.notes && <p className="mt-4 whitespace-pre-wrap break-words text-sm"><span className="text-muted-foreground">Ghi chú: </span>{room.notes}</p>}
              </AccordionContent>
            </AccordionItem>
            <PermissionGate module="reports" action="view">
              <AccordionItem value="performance">
                <AccordionTrigger className="text-sm">Thống kê 30 ngày</AccordionTrigger>
                <AccordionContent><PanelPerformance roomId={id!} /></AccordionContent>
              </AccordionItem>
            </PermissionGate>
          </Accordion>
        </TabsContent>

        <TabsContent value="items" className="mt-0">
          <PanelItems roomId={id!} items={items} onRequestSupplement={() => openSupplement()} />
          <Accordion type="multiple" value={deliverySections} onValueChange={setDeliverySections}>
            <AccordionItem value="deliveries">
              <AccordionTrigger className="text-sm">Giao nhận đồ dùng</AccordionTrigger>
              <AccordionContent><RoomDistributionHistory roomId={id!} roomNumber={room.room_number} /></AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>

        <TabsContent value="history" className="mt-0 space-y-4 py-5">
          <h2 className="text-base font-semibold">Lịch sử kiểm tra phòng</h2>
          <EnhancedCheckHistory checks={checks} />
        </TabsContent>
      </Tabs>

      <PermissionGate module="rooms" action="update">
        {showSupplement && <RoomSupplementSheet open={showSupplement} onOpenChange={setShowSupplement} roomId={id!} roomNumber={room.room_number} initialMode={supplementMode} />}
        <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Đặt lại đồ dùng phòng {room.room_number}?</AlertDialogTitle>
              <AlertDialogDescription>
                Các đồ dùng ngoài tiêu chuẩn sẽ bị xóa. Số lượng đồ dùng được đặt lại theo tiêu chuẩn phòng {room.room_type}. Thao tác này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction
                disabled={setupRoom.isPending}
                onClick={() => {
                  if (setupRoom.isPending) return
                  setupRoom.mutate({ roomId: id!, reset: true })
                  setShowResetDialog(false)
                }}
                className="bg-destructive hover:bg-destructive/90"
              >
                Đặt lại đồ dùng
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PermissionGate>

      {showCreateTask && <CreateTaskDialog open={showCreateTask} onOpenChange={setShowCreateTask} roomId={id!} roomNumber={room.room_number} hotelId={room.hotel_id} />}
      {showAuditLog && <RoomAuditLogDialog open={showAuditLog} onOpenChange={setShowAuditLog} roomId={id!} roomNumber={room.room_number} />}
    </div>
  )

  return isMobile
    ? <PullToRefresh onRefresh={async () => { await refetch() }}>{content}</PullToRefresh>
    : content
}

function RoomDetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-0">
      <Skeleton className="h-10 w-52" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}
