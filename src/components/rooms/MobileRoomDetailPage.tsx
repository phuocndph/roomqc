import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { navigateBack } from '@/lib/navigation'
import { useTranslation } from 'react-i18next'
import { 
  ArrowLeft,
  Edit, 
  ClipboardCheck, 
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  DoorOpen,
  Bed,
  Users,
  Maximize2,
  Eye,
  Printer,
  User,
  Truck,
  PackagePlus,
  Gift,
  LogOut,
  MoreVertical,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RoomStatusBadge } from '@/components/rooms/RoomStatusBadge'
import { RoomDetailTitleBlock } from '@/components/rooms/detail/RoomDetailTitleBlock'
import { RoomItemsList } from '@/components/rooms/RoomItemsList'
import { EnhancedCheckHistory } from '@/components/rooms/EnhancedCheckHistory'
import { RoomHealthScore } from '@/components/rooms/RoomHealthScore'
import { RoomDistributionHistory } from '@/components/rooms/RoomDistributionHistory'
import { RoomSupplementSheet } from '@/components/rooms/RoomSupplementSheet'
import { GuestInfoCard } from '@/components/rooms/GuestInfoCard'
import { StaffRoomDetailPage } from '@/components/rooms/StaffRoomDetailPage'
import { CreateTaskDialog } from '@/components/housekeeping/CreateTaskDialog'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { useRoom } from '@/hooks/useRooms'
import { useApplyStandards } from '@/hooks/useRoomStandards'
import { useRoomDistributionHistory } from '@/hooks/useRoomDistributionHistory'
import { useUser } from '@/hooks/useUser'
import { formatCurrency } from '@/lib/utils'
import { canCreateHousekeepingTask } from '@/lib/userAccess'
import type { RoomStatus, CheckType } from '@/types/rooms.types'

const escHtml = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const handlePrintItemList = (roomNumber: string | undefined, items: any[], t: any) => {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  
  const standardItems = items.filter(item => item.has_standard)
  
  printWindow.document.write(`
    <html>
      <head>
        <title>${escHtml(t('print.itemListTitle', { roomNumber }))}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 18px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          .missing { color: red; }
          .complete { color: green; }
        </style>
      </head>
      <body>
        <h1>${escHtml(t('print.itemListTitle', { roomNumber }))}</h1>
        <table>
          <thead>
            <tr>
              <th>${escHtml(t('print.columns.index'))}</th>
              <th>${escHtml(t('print.columns.itemName'))}</th>
              <th>${escHtml(t('print.columns.required'))}</th>
              <th>${escHtml(t('print.columns.current'))}</th>
              <th>${escHtml(t('print.columns.missing'))}</th>
              <th>${escHtml(t('print.columns.status'))}</th>
            </tr>
          </thead>
          <tbody>
            ${standardItems.map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${escHtml(item.item_name)}</td>

                <td>${item.standard_quantity}</td>
                <td>${item.current_quantity}</td>
                <td class="${item.missing_quantity > 0 ? 'missing' : ''}">${item.missing_quantity}</td>
                <td class="${item.missing_quantity > 0 ? 'missing' : 'complete'}">
                  ${item.missing_quantity > 0 ? t('print.statusMissing') : t('print.statusComplete')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p style="margin-top: 20px; font-size: 12px;">${escHtml(t('print.printDate', { date: new Date().toLocaleString('vi-VN') }))}</p>
      </body>
    </html>
  `)
  printWindow.document.close()

  printWindow.print()
}

export function MobileRoomDetailPage() {
  const { t } = useTranslation(['rooms', 'common', 'distribution'])
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading, refetch } = useRoom(id)
  const { user, hasAnyRole } = useUser()
  const applyStandards = useApplyStandards()
  const { data: deliveryHistory } = useRoomDistributionHistory(id)
  
  // Check if user is manager (has manager-level roles)
  const isManager = hasAnyRole(['super_admin', 'owner', 'hotel_manager', 'department_manager'])
  const canCreateTask = canCreateHousekeepingTask(user)
  
  // Count pending deliveries
  const pendingDeliveryCount = deliveryHistory?.filter(
    h => h.room_status === 'pending' || h.room_status === 'delivered'
  ).length || 0
  
  // Auto-switch to delivery tab when pending orders exist
  const [activeTab, setActiveTab] = useState('info')
  const [showSupplementSheet, setShowSupplementSheet] = useState(false)
  const [supplementMode, setSupplementMode] = useState<'missing' | 'extra'>('missing')
  const [showCreateTask, setShowCreateTask] = useState(false)
  
  useEffect(() => {
    if (pendingDeliveryCount > 0 && !isLoading) {
      setActiveTab('items')
    }
  }, [pendingDeliveryCount, isLoading])

  const handleRefresh = async () => {
    await refetch()
  }
  
  // Staff view: simplified interface with only check room functionality
  if (!isManager && !isLoading) {
    return <StaffRoomDetailPage />
  }
  
  if (isLoading) {
    return <MobileRoomDetailSkeleton />
  }
  
  if (!data) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/rooms')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">{t('roomDetail')}</h1>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">{t('detail.notFound')}</h3>
          <Button onClick={() => navigateBack(navigate, '/rooms')} className="mt-4">
            {t('detail.backToList')}
          </Button>
        </div>
      </div>
    )
  }
  
  const { room, items, recent_checks: checks } = data
  
  // Calculate item statistics
  const standardItems = items.filter(item => item.has_standard)
  const otherItems = items.filter(item => !item.has_standard)
  const totalItemsInRoom = items.length
  const completeItems = standardItems.filter(item => item.missing_quantity === 0).length
  const missingCount = standardItems.filter(item => item.missing_quantity > 0).length
  const totalMissingQuantity = standardItems.reduce((sum, item) => sum + item.missing_quantity, 0)

  return (
    <PullToRefresh onRefresh={handleRefresh} className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/rooms')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <RoomDetailTitleBlock room={room} />

          </div>
        <div className="flex items-center gap-1">
            {/* Primary action: Supplement missing items */}
            {missingCount > 0 && (
              <Button 
                variant="default" 
                size="sm"
                className="h-8 gap-1 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => {
                  setSupplementMode('missing')
                  setShowSupplementSheet(true)
                }}
              >
                <PackagePlus className="h-4 w-4" />
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 bg-white/20 text-white">
                  {missingCount}
                </Badge>
              </Button>
            )}
            {/* Check room button */}
            <Button 
              variant="ghost" 
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate(`/rooms/${id}/check`)}
            >
              <ClipboardCheck className="h-4 w-4" />
            </Button>
            {/* More actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Thêm tùy chọn">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canCreateTask && (
                  <DropdownMenuItem onClick={() => setShowCreateTask(true)}>
                    <Wrench className="h-4 w-4 mr-2" />
                    Yêu cầu công việc
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => {
                  setSupplementMode('extra')
                  setShowSupplementSheet(true)
                }}>
                  <Gift className="h-4 w-4 mr-2" />
                  {t('detail.extraItems')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePrintItemList(room.room_number, items, t)}>
                  <Printer className="h-4 w-4 mr-2" />
                  {t('detail.printItemList')}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => applyStandards.mutate(id!)}
                  disabled={applyStandards.isPending}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${applyStandards.isPending ? 'animate-spin' : ''}`} />
                  {standardItems.length === 0 ? t('detail.applyStandards') : t('detail.syncStandards')}
                </DropdownMenuItem>
                <PermissionGate module="rooms" action="update">
                  <DropdownMenuItem onClick={() => navigate(`/rooms/${id}/edit`)}>
                    <Edit className="h-4 w-4 mr-2" />
                    {t('detail.editInfo')}
                  </DropdownMenuItem>
                </PermissionGate>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Room Supplement Sheet */}
      <RoomSupplementSheet
        open={showSupplementSheet}
        onOpenChange={setShowSupplementSheet}
        roomId={id!}
        roomNumber={room.room_number}
        initialMode={supplementMode}
      />

      {/* Create Task Dialog */}
      {showCreateTask && (
        <CreateTaskDialog
          open={showCreateTask}
          onOpenChange={setShowCreateTask}
          roomId={id!}
          roomNumber={room.room_number}
          hotelId={room.hotel_id}
        />
      )}

      {/* Compact Stats Row + Health Score */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-around p-3 bg-muted/50 rounded-lg mb-3">
          <div className="text-center">
            <p className="text-xl font-bold text-primary">{totalItemsInRoom}</p>
            <p className="text-[10px] text-muted-foreground">{t('detail.totalItems')}</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-center">
            <p className="text-xl font-bold text-green-600">{completeItems}</p>
            <p className="text-[10px] text-muted-foreground">{t('detail.complete')}</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-center">
            <p className="text-xl font-bold text-destructive">{missingCount}</p>
            <p className="text-[10px] text-muted-foreground">{t('detail.missing')}</p>
          </div>
        </div>
        <RoomHealthScore 
          checks={checks} 
          totalItems={standardItems.length} 
          missingItems={missingCount}
          compact
        />
      </div>

      {/* Alert Banner for Checkout Required */}
      {room.status === 'check_out' && (
        <div className="px-4 pb-2">
          <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950/30">
            <LogOut className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800 dark:text-orange-200">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  Phòng này cần kiểm tra checkout
                </span>
                <Button 
                  size="sm" 
                  className="h-7 bg-orange-600 hover:bg-orange-700"
                  onClick={() => navigate(`/rooms/${id}/check?type=checkout`)}
                >
                  <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                  Kiểm tra ngay
                </Button>
              </div>
              <p className="text-xs mt-1 opacity-80">
                Khách đã trả phòng. Vui lòng kiểm tra đồ dùng, ghi nhận mất mát và hư hỏng.
              </p>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Alert Banner for Pending Deliveries */}
      {pendingDeliveryCount > 0 && activeTab !== 'delivery' && (
        <div className="px-4 pb-2">
          <Alert 
            className="border-amber-500 bg-amber-50 dark:bg-amber-950/30 cursor-pointer"
            onClick={() => setActiveTab('delivery')}
          >
            <Truck className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200 flex items-center justify-between">
              <span>
                {t('distribution:roomHistory.pendingAlert', { count: pendingDeliveryCount })}
              </span>
              <ChevronRight className="h-4 w-4" />
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Tabs - Consolidated from 4 to 3 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList className="w-full justify-start px-4 bg-transparent border-b rounded-none h-auto gap-4">
          <TabsTrigger 
            value="info" 
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 text-sm"
          >
            {t('tabs.info')}
          </TabsTrigger>
          <TabsTrigger 
            value="items"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 text-sm"
          >
            {t('tabs.items')}
            {(missingCount > 0 || pendingDeliveryCount > 0) && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                {missingCount + pendingDeliveryCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="history"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 text-sm"
          >
            {t('tabs.history')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="flex-1 p-4 pb-20 space-y-4 m-0">
          {/* Guest Info Card - Show current booking */}
          <GuestInfoCard 
            roomId={id!} 
            hotelId={room.hotel_id}
            tenantId={room.tenant_id}
            roomNumber={room.room_number}
          />

          {/* Room Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('detail.roomInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <DoorOpen className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('detail.roomNumber')}</p>
                    <p className="font-semibold">{room.room_number}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Bed className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('detail.bedType')}</p>
                    <p className="font-medium capitalize">{room.bed_type || t('detail.na')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('detail.maxGuests')}</p>
                    <p className="font-medium">{t('detail.guestCount', { count: room.max_guests })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Maximize2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('detail.area')}</p>
                    <p className="font-medium">{room.area_sqm ? `${room.area_sqm} m²` : t('detail.na')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('detail.view')}</p>
                    <p className="font-medium capitalize">{room.view_type || t('detail.na')}</p>
                  </div>
                </div>
              </div>

              {room.base_price && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">{t('detail.basePrice')}</p>
                  <p className="font-semibold text-lg">{t('detail.pricePerNight', { price: formatCurrency(room.base_price) })}</p>
                </div>
              )}

              {room.amenities && room.amenities.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">{t('detail.amenities')}</p>
                  <div className="flex flex-wrap gap-1">
                    {room.amenities.map((amenity: string, index: number) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {amenity}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {room.notes && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">{t('detail.notes')}</p>
                  <p className="text-sm">{room.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Photos */}
          {checks && checks.length > 0 && checks[0].photos && Array.isArray(checks[0].photos) && checks[0].photos.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t('detail.recentPhotos')}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {t(`checkTypes.${checks[0].check_type}`, { defaultValue: checks[0].check_type })}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {new Date(checks[0].checked_at).toLocaleDateString('vi-VN')}
                    </Badge>
                  </div>
                </div>
                {/* Checked by info */}
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>{t('detail.checkedBy', { name: checks[0].checked_by_name || t('detail.na') })}</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {(checks[0].photos as string[]).slice(0, 3).map((photo, idx) => (
                    <a
                      key={idx}
                      href={photo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative aspect-square rounded-lg overflow-hidden border group"
                    >
                      <img 
                        src={photo} 
                        alt={`Photo ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-active:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="text-white text-xs font-medium">{t('detail.viewFull')}</span>
                      </div>
                    </a>
                  ))}
                </div>
                {(checks[0].photos as string[]).length > 3 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {t('detail.andMorePhotos', { count: (checks[0].photos as string[]).length - 3 })}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="items" className="flex-1 p-4 pb-20 m-0 space-y-4">
          {totalItemsInRoom === 0 && (
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="p-3 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {t('detail.noItems')}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    {t('detail.noItemsHint', { type: room.room_type })}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          <RoomItemsList 
            items={items} 
            roomId={id!} 
            onRequestSupplement={() => {
              setSupplementMode('missing')
              setShowSupplementSheet(true)
            }}
          />
          {/* Distribution History integrated into Items tab */}
          <RoomDistributionHistory roomId={id!} roomNumber={room.room_number} />
        </TabsContent>

        <TabsContent value="history" className="flex-1 p-4 pb-20 m-0">
          <EnhancedCheckHistory checks={checks} />
        </TabsContent>
      </Tabs>
    </PullToRefresh>
  )
}

function MobileRoomDetailSkeleton() {
  const { t } = useTranslation('rooms')
  const navigate = useNavigate()
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/rooms')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-20 mt-1" />
          </div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  )
}
