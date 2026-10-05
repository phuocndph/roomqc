import { useState, useMemo } from 'react'
import { Truck, Package, AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Accordion } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { 
  useRoomDistributionHistory, 
  useConfirmRoomDelivery,
  useBatchConfirmDeliveries,
  useRejectRoomDelivery, 
  useUndoRoomDelivery,
  type RoomDistributionHistoryItem
} from '@/hooks/useRoomDistributionHistory'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/hooks/useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { triggerDistributionDeliveryRejected } from '@/hooks/useNotificationTriggers'
import { DistributionAccordionItem } from './distribution/DistributionAccordionItem'
import { BatchConfirmBar } from './distribution/BatchConfirmBar'
import { useTranslation } from 'react-i18next'

interface RoomDistributionHistoryProps {
  roomId: string
  roomNumber?: string
}

export function RoomDistributionHistory({ roomId, roomNumber }: RoomDistributionHistoryProps) {
  const { t } = useTranslation(['distribution', 'common'])
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  const { data: history, isLoading } = useRoomDistributionHistory(roomId)
  
  const [selectedOrders, setSelectedOrders] = useState<string[]>([])
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<RoomDistributionHistoryItem | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const confirmDelivery = useConfirmRoomDelivery()
  const batchConfirm = useBatchConfirmDeliveries()
  const rejectDelivery = useRejectRoomDelivery()
  const undoDelivery = useUndoRoomDelivery()

  // Separate pending vs processed
  const { pendingOrders, processedOrders } = useMemo(() => {
    if (!history) return { pendingOrders: [], processedOrders: [] }
    return {
      pendingOrders: history.filter(h => h.room_status === 'pending' || h.room_status === 'delivered'),
      processedOrders: history.filter(h => h.room_status !== 'pending' && h.room_status !== 'delivered')
    }
  }, [history])

  // Selection handlers
  const handleSelect = (id: string, selected: boolean) => {
    setSelectedOrders(prev => 
      selected ? [...prev, id] : prev.filter(x => x !== id)
    )
  }

  const handleSelectAll = () => {
    setSelectedOrders(pendingOrders.map(o => o.room_order_id))
  }

  const handleClearSelection = () => {
    setSelectedOrders([])
  }

  // Action handlers
  const handleConfirm = (item: RoomDistributionHistoryItem) => {
    if (!user?.id) return
    confirmDelivery.mutate({
      roomOrderId: item.room_order_id,
      confirmedBy: user.id
    })
  }

  const handleBatchConfirm = () => {
    if (!user?.id || selectedOrders.length === 0) return
    batchConfirm.mutate({
      roomOrderIds: selectedOrders,
      confirmedBy: user.id
    }, {
      onSuccess: () => setSelectedOrders([])
    })
  }

  const handleOpenRejectDialog = (item: RoomDistributionHistoryItem) => {
    setSelectedItem(item)
    setRejectionReason('')
    setRejectDialogOpen(true)
  }

  const handleReject = async () => {
    if (!selectedItem || !user?.id || !rejectionReason.trim()) return

    rejectDelivery.mutate({
      distributionOrderRoomId: selectedItem.room_order_id,
      rejectedBy: user.id,
      rejectionReason: rejectionReason.trim(),
    }, {
      onSuccess: async () => {
        setRejectDialogOpen(false)
        
        // Send notification
        if (tenant?.id && selectedHotel?.id) {
          try {
            await triggerDistributionDeliveryRejected({
              tenantId: tenant.id,
              hotelId: selectedHotel.id,
              orderId: selectedItem.order_id,
              orderCode: selectedItem.order_code,
              roomNumber: roomNumber || '',
              createdByUserId: user.id,
              assignedToUserId: null,
              rejectedByUserId: user.id,
              rejectionReason: rejectionReason.trim(),
            })
          } catch (e) {
            console.error('Failed to send notification:', e)
          }
        }
      }
    })
  }

  const handleUndo = (item: RoomDistributionHistoryItem) => {
    if (!user?.id) return
    undoDelivery.mutate({
      distributionOrderRoomId: item.room_order_id,
      performedBy: user.id,
    })
  }

  // Default open only first pending item
  const defaultOpenItems = useMemo(() => 
    pendingOrders.length > 0 ? [pendingOrders[0].room_order_id] : [],
    [pendingOrders]
  )

  if (isLoading) {
    return (
      <div className="border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Lịch sử giao hàng</p>
        </div>
        <div className="space-y-2">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!history || history.length === 0) {
    return (
      <div className="border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">{t('distribution:roomHistory.title')}</p>
        </div>
        <div className="text-center py-4 text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">{t('distribution:roomHistory.empty')}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">{t('distribution:roomHistory.title')}</p>
          <span className="text-xs text-muted-foreground ml-auto">{history.length}</span>
          {pendingOrders.length > 0 && (
            <span className="text-xs font-medium text-amber-600 animate-pulse">
              {pendingOrders.length} chờ
            </span>
          )}
        </div>
        
        <div className={cn("space-y-3", selectedOrders.length > 0 && "pb-16")}>
          {/* Pending Section */}
          {pendingOrders.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-600">
                <AlertCircle className="h-3.5 w-3.5" />
                Cần xác nhận
              </div>
              <Accordion 
                type="multiple" 
                defaultValue={defaultOpenItems}
                className="space-y-2"
              >
                {pendingOrders.map(item => (
                  <DistributionAccordionItem
                    key={item.room_order_id}
                    item={item}
                    isSelected={selectedOrders.includes(item.room_order_id)}
                    onSelect={handleSelect}
                    onConfirm={handleConfirm}
                    onReject={handleOpenRejectDialog}
                    onUndo={handleUndo}
                    isConfirming={confirmDelivery.isPending}
                    isRejecting={rejectDelivery.isPending}
                    isUndoing={undoDelivery.isPending}
                  />
                ))}
              </Accordion>
            </div>
          )}

          {/* Processed Section */}
          {processedOrders.length > 0 && (
            <div className="space-y-2">
              {pendingOrders.length > 0 && (
                <div className="text-xs font-medium text-muted-foreground pt-2 border-t">
                  Đã xử lý
                </div>
              )}
              <Accordion type="multiple" className="space-y-2">
                {processedOrders.map(item => (
                  <DistributionAccordionItem
                    key={item.room_order_id}
                    item={item}
                    isSelected={false}
                    onSelect={() => {}}
                    onConfirm={handleConfirm}
                    onReject={handleOpenRejectDialog}
                    onUndo={handleUndo}
                    isConfirming={confirmDelivery.isPending}
                    isRejecting={rejectDelivery.isPending}
                    isUndoing={undoDelivery.isPending}
                  />
                ))}
              </Accordion>
            </div>
          )}
        </div>
      </div>

      {/* Batch Confirm Bar */}
      <BatchConfirmBar
        selectedCount={selectedOrders.length}
        totalPending={pendingOrders.length}
        onConfirmAll={handleBatchConfirm}
        onClearSelection={handleClearSelection}
        onSelectAll={handleSelectAll}
        isConfirming={batchConfirm.isPending}
      />

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('distribution:rejectDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('distribution:rejectDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">{t('distribution:rejectDialog.reasonLabel')}</Label>
              <Textarea
                id="rejection-reason"
                placeholder={t('distribution:rejectDialog.reasonPlaceholder')}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              {t('distribution:rejectDialog.cancel')}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={!rejectionReason.trim() || rejectDelivery.isPending}
            >
              {rejectDelivery.isPending ? t('distribution:rejectDialog.processing') : t('distribution:rejectDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
