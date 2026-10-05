import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useUser } from '@/hooks/useUser'
import { navigateBack } from '@/lib/navigation'
import { 
  ArrowLeft,
  ClipboardCheck, 
  AlertCircle,
  CheckCircle2,
  Package,
  Calendar,
  User,
  XCircle,
  Plus,
  Shirt,
  Droplets,
  Tv,
  Armchair,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { RoomStatusBadge } from '@/components/rooms/RoomStatusBadge'
import { RoomDetailTitleBlock } from '@/components/rooms/detail/RoomDetailTitleBlock'
import { RoomSupplementSheet } from '@/components/rooms/RoomSupplementSheet'
import { CheckoutInspectionBanner } from '@/components/rooms/CheckoutInspectionBanner'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { useRoom } from '@/hooks/useRooms'
import { useRoomBooking } from '@/hooks/useRoomBooking'
import { usePendingInspections, useRoomHasPendingInspection } from '@/hooks/useCheckoutInspection'
import type { RoomStatus, RoomItemWithDetails } from '@/types/rooms.types'
import type { ItemType } from '@/types/items.types'
import { ITEM_TYPE_LABELS } from '@/types/items.types'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { supabase } from '@/integrations/supabase/client'
import { useQuery } from '@tanstack/react-query'

interface ExtendedRoomItem extends RoomItemWithDetails {
  item_type: ItemType
  category_name: string | null
}

const ITEM_TYPE_ICONS: Record<ItemType, React.ReactNode> = {
  linen: <Shirt className="h-4 w-4" />,
  consumable: <Droplets className="h-4 w-4" />,
  equipment: <Tv className="h-4 w-4" />,
  furniture: <Armchair className="h-4 w-4" />,
}

export function StaffRoomDetailPage() {
  const { t } = useTranslation(['rooms', 'common'])
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasAnyRole } = useUser()
  const { data, isLoading, refetch } = useRoom(id)
  const { data: booking } = useRoomBooking(id)
  
  const isManager = hasAnyRole(['super_admin', 'owner', 'hotel_manager', 'department_manager'])
  const handleHeaderBack = () => {
    navigateBack(navigate, isManager ? '/rooms' : '/my-tasks')
  }
  
  // Checkout inspection (assigned cho tôi)
  const { 
    pendingInspection, 
    startInspection,
    isLoading: isLoadingInspection,
    refetch: refetchInspection,
  } = usePendingInspections(id)
  
  // Kiểm tra phòng có yêu cầu inspection nào không (bất kể assigned cho ai)
  const { 
    roomInspection, 
    isLoading: isLoadingRoomInspection 
  } = useRoomHasPendingInspection(id)
  
  // Nếu phòng có yêu cầu inspection mà không phải assigned cho tôi -> chặn
  const isBlockedFromInspection = roomInspection && !roomInspection.isAssignedToMe
  
  const [activeTab, setActiveTab] = useState<'overview' | 'items'>('overview')
  const [supplementSheetOpen, setSupplementSheetOpen] = useState(false)
  const [supplementMode, setSupplementMode] = useState<'missing' | 'extra'>('missing')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  
  // Fetch item types for room items
  const { data: itemsWithType = [] } = useQuery({
    queryKey: ['room-items-with-type', id],
    queryFn: async () => {
      if (!data?.items?.length) return []
      const itemIds = data.items.map(i => i.item_id)
      const { data: itemData } = await supabase
        .from('items')
        .select('id, item_type, category_id, item_categories(name)')
        .in('id', itemIds)
      
      if (!itemData) return data.items.map(item => ({
        ...item,
        item_type: 'equipment' as ItemType,
        category_name: null
      }))
      
      const itemMap = new Map(itemData.map(d => [d.id, {
        item_type: d.item_type as ItemType,
        category_name: (d.item_categories as any)?.name || null
      }]))
      
      return data.items.map(item => ({
        ...item,
        item_type: itemMap.get(item.item_id)?.item_type || 'equipment',
        category_name: itemMap.get(item.item_id)?.category_name || null
      })) as ExtendedRoomItem[]
    },
    enabled: !!data?.items?.length,
  })
  
  const handleRefresh = async () => {
    await refetch()
  }
  
  const handleOpenSupplement = (mode: 'missing' | 'extra') => {
    setSupplementMode(mode)
    setSupplementSheetOpen(true)
  }
  
  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryName)) {
        next.delete(categoryName)
      } else {
        next.add(categoryName)
      }
      return next
    })
  }
  
  // Group items by type and then by category
  const groupedItems = useMemo(() => {
    const byType: Record<ItemType, ExtendedRoomItem[]> = {
      linen: [],
      consumable: [],
      equipment: [],
      furniture: [],
    }
    
    itemsWithType.forEach(item => {
      byType[item.item_type]?.push(item)
    })
    
    // For each type, group by category
    const result: Record<ItemType, Record<string, ExtendedRoomItem[]>> = {
      linen: {},
      consumable: {},
      equipment: {},
      furniture: {},
    }
    
    Object.entries(byType).forEach(([type, items]) => {
      items.forEach(item => {
        const category = item.category_name || 'Khác'
        if (!result[type as ItemType][category]) {
          result[type as ItemType][category] = []
        }
        result[type as ItemType][category].push(item)
      })
    })
    
    return result
  }, [itemsWithType])
  
  // Auto-expand categories with missing items
  useEffect(() => {
    const categoriesWithMissing = new Set<string>()
    itemsWithType.forEach(item => {
      if (item.missing_quantity > 0) {
        categoriesWithMissing.add(item.category_name || 'Khác')
      }
    })
    if (categoriesWithMissing.size > 0 && expandedCategories.size === 0) {
      setExpandedCategories(categoriesWithMissing)
    }
  }, [itemsWithType, expandedCategories.size])
  
  if (isLoading) {
    return <StaffRoomDetailSkeleton />
  }
  
  if (!data) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleHeaderBack} aria-label="Quay lại">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">{t('roomDetail')}</h1>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">{t('detail.notFound')}</h3>
          <Button onClick={handleHeaderBack} className="mt-4">
            {t('detail.backToList')}
          </Button>
        </div>
      </div>
    )
  }
  
  const { room, items } = data
  
  // Calculate item statistics
  const standardItems = items.filter(item => item.has_standard)
  const totalItemsInRoom = items.length
  const completeItems = standardItems.filter(item => item.missing_quantity === 0).length
  const missingCount = standardItems.filter(item => item.missing_quantity > 0).length
  const totalMissingQuantity = standardItems.reduce((sum, item) => sum + item.missing_quantity, 0)
  
  const isItemsComplete = missingCount === 0
  
  // Count by type
  const countByType = (type: ItemType) => 
    itemsWithType.filter(i => i.item_type === type).length
  
  const missingByType = (type: ItemType) =>
    itemsWithType.filter(i => i.item_type === type && i.missing_quantity > 0).length
  
  return (
    <>
      <PullToRefresh onRefresh={handleRefresh} className="flex flex-col min-h-screen bg-background">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={handleHeaderBack} aria-label="Quay lại">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <RoomDetailTitleBlock room={room} />

            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b">
          <div className="flex">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'overview' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Tổng quan
            </button>
            <button
              onClick={() => setActiveTab('items')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                activeTab === 'items' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Đồ trong phòng
              {missingCount > 0 && (
                <Badge variant="destructive" className="absolute -top-1 right-4 h-5 px-1.5 text-xs">
                  {missingCount}
                </Badge>
              )}
            </button>
          </div>
        </div>

        {/* Checkout Inspection Banner */}
        {pendingInspection && id && (
          <CheckoutInspectionBanner
            inspection={pendingInspection}
            roomId={id}
            onStartInspection={() => startInspection.mutateAsync(pendingInspection.id)}
            isLoading={startInspection.isPending}
          />
        )}

        {/* Main Content */}
        <div className="flex-1 p-4 space-y-4 pb-24">
          {activeTab === 'overview' ? (
            <>
              {/* Item Status — compact one-line */}
              {totalItemsInRoom === 0 ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/20">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                      Phòng chưa thiết lập danh sách đồ chuẩn
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Liên hệ quản lý để thêm đồ vào phòng
                    </p>
                  </div>
                </div>
              ) : isItemsComplete ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-green-500/50 bg-green-50/30 dark:bg-green-950/20">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                    Đầy đủ {totalItemsInRoom} món
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab('items')}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/20 text-left hover:bg-amber-50/50"
                >
                  <div className="flex items-center gap-3">
                    <XCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                      Thiếu {missingCount}/{standardItems.length} món
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({totalMissingQuantity} cái)
                      </span>
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              )}

              {/* Guest Info Card */}
              {booking && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">{t('detail.currentGuest')}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Check-in</p>
                          <p className="text-sm font-medium">
                            {format(new Date(booking.check_in_date), 'dd/MM/yyyy', { locale: vi })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Check-out</p>
                          <p className="text-sm font-medium">
                            {format(new Date(booking.check_out_date), 'dd/MM/yyyy', { locale: vi })}
                          </p>
                        </div>
                      </div>
                    </div>
                    {booking.guest_count > 1 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {t('detail.guestCount', { count: booking.guest_count })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Alert checkout đã được hợp nhất vào CheckoutInspectionBanner ở trên — không hiển thị lặp */}
            </>
          ) : (
            /* Items Tab */
            <div className="space-y-4">
              {/* Quick Filter by Type */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {(['linen', 'consumable', 'equipment', 'furniture'] as ItemType[]).map(type => {
                  const count = countByType(type)
                  const missing = missingByType(type)
                  return (
                    <button
                      key={type}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm whitespace-nowrap ${
                        count > 0 ? 'bg-background' : 'bg-muted/50 text-muted-foreground'
                      }`}
                      onClick={() => {
                        // Expand all categories for this type
                        Object.keys(groupedItems[type]).forEach(cat => {
                          setExpandedCategories(prev => new Set([...prev, cat]))
                        })
                      }}
                    >
                      {ITEM_TYPE_ICONS[type]}
                      <span>{ITEM_TYPE_LABELS[type]}</span>
                      <Badge variant={missing > 0 ? 'destructive' : 'secondary'} className="h-5 px-1.5 text-xs">
                        {count}
                      </Badge>
                    </button>
                  )
                })}
              </div>

              {/* Items Grouped by Type and Category */}
              {(['linen', 'consumable', 'equipment', 'furniture'] as ItemType[]).map(type => {
                const categories = groupedItems[type]
                const categoryNames = Object.keys(categories)
                if (categoryNames.length === 0) return null
                
                return (
                  <div key={type} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      {ITEM_TYPE_ICONS[type]}
                      <span>{ITEM_TYPE_LABELS[type]}</span>
                      <Badge variant="outline" className="text-xs">{countByType(type)}</Badge>
                    </div>
                    
                    {categoryNames.map(categoryName => {
                      const categoryItems = categories[categoryName]
                      const hasMissing = categoryItems.some(i => i.missing_quantity > 0)
                      const isExpanded = expandedCategories.has(categoryName)
                      
                      return (
                        <Collapsible 
                          key={categoryName} 
                          open={isExpanded}
                          onOpenChange={() => toggleCategory(categoryName)}
                        >
                          <CollapsibleTrigger className="w-full">
                            <div className={`flex items-center justify-between p-3 rounded-lg border ${
                              hasMissing ? 'border-destructive/50 bg-destructive/5' : 'bg-muted/30'
                            }`}>
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                <span className="font-medium text-sm">{categoryName}</span>
                                <Badge variant="secondary" className="text-xs">{categoryItems.length}</Badge>
                              </div>
                              {hasMissing && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Thiếu đồ
                                </Badge>
                              )}
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-1 space-y-1 pl-6">
                              {categoryItems.map(item => (
                                <div 
                                  key={item.item_id}
                                  className="flex items-center justify-between p-2 rounded border bg-background"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{item.item_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      SL: {item.current_quantity}/{item.standard_quantity}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {item.missing_quantity > 0 ? (
                                      <Badge variant="destructive" className="text-xs">
                                        -{item.missing_quantity}
                                      </Badge>
                                    ) : (
                                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )
                    })}
                  </div>
                )
              })}

              {itemsWithType.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">Chưa có đồ trong phòng</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => handleOpenSupplement('extra')}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Thêm đồ vào phòng
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fixed Bottom Actions — ẨN TOÀN BỘ khi có CheckoutInspectionBanner ở trên (chỉ giữ 1 hành động chính) */}
        {!pendingInspection && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t safe-area-pb space-y-3">
            {/* Alert nếu phòng có yêu cầu checkout giao cho nhân viên khác */}
            {isBlockedFromInspection && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Phòng đang có yêu cầu kiểm tra checkout giao cho{' '}
                  <span className="font-medium">{roomInspection.assignedUserName || 'nhân viên khác'}</span>.
                  Bạn không được phép kiểm tra phòng này.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="flex gap-3">
              {missingCount > 0 && !isBlockedFromInspection && (
                <Button 
                  variant="outline"
                  className="flex-1 h-12 gap-2"
                  onClick={() => handleOpenSupplement('missing')}
                >
                  <Plus className="h-5 w-5" />
                  Bổ sung đồ
                </Button>
              )}
              <Button 
                className={`h-12 text-base font-semibold gap-2 ${missingCount > 0 && !isBlockedFromInspection ? 'flex-1' : 'w-full'}`}
                disabled={isLoadingInspection || isLoadingRoomInspection || isBlockedFromInspection}
                onClick={() => navigate(`/rooms/${id}/check`)}
              >
                {(isLoadingInspection || isLoadingRoomInspection) ? (
                  <span className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : isBlockedFromInspection ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <ClipboardCheck className="h-5 w-5" />
                )}
                {isBlockedFromInspection ? 'Không có quyền' : t('detail.checkRoom')}
              </Button>
            </div>
          </div>
        )}
      </PullToRefresh>
      
      {/* Supplement Sheet */}
      <RoomSupplementSheet
        open={supplementSheetOpen}
        onOpenChange={setSupplementSheetOpen}
        roomId={id || ''}
        roomNumber={room?.room_number || ''}
        initialMode={supplementMode}
      />
    </>
  )
}

function StaffRoomDetailSkeleton() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-24 mt-1" />
          </div>
        </div>
      </div>
      <div className="border-b">
        <div className="flex">
          <Skeleton className="flex-1 h-10 m-2" />
          <Skeleton className="flex-1 h-10 m-2" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="sticky bottom-0 p-4 bg-background border-t">
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  )
}
