import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { 
  Inbox, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ChevronRight,
  DoorOpen,
  Plus,
  Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { 
  useLaundryRequests,
  usePendingLaundryRequestsCount,
  useAddToDraftBatch,
  useDraftLaundryBatch,
  type LaundryRequest,
  type LaundryRequestItem,
} from '@/hooks/useLaundryRequests'
import { cn } from '@/lib/utils'
import { supabase } from '@/integrations/supabase/client'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useUser } from '@/hooks/useUser'
import { AddToLaundryBatchDialog } from './AddToLaundryBatchDialog'
import { SendLaundryBatchDialog } from './SendLaundryBatchDialog'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Chờ xử lý', color: 'text-amber-600', icon: Clock },
  added_to_batch: { label: 'Đã thêm', color: 'text-green-600', icon: CheckCircle },
  cancelled: { label: 'Đã hủy', color: 'text-muted-foreground', icon: XCircle },
}

export function LaundryRequestsTab() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { tenantId } = useUser()
  const [selectedRequest, setSelectedRequest] = useState<LaundryRequest | null>(null)
  const [confirmDialogRequest, setConfirmDialogRequest] = useState<LaundryRequest | null>(null)
  const [sendBatchDialogOpen, setSendBatchDialogOpen] = useState(false)
  
  // Get sendBatch param from URL
  const sendBatchParam = searchParams.get('sendBatch')
  
  const { data: requests, isLoading } = useLaundryRequests({ status: 'pending' })
  const { data: pendingCount } = usePendingLaundryRequestsCount()
  const { data: draftBatch } = useDraftLaundryBatch()
  const addToBatch = useAddToDraftBatch()
  
  // Load specific batch by ID if sendBatch param exists
  const { data: batchToSend } = useQuery({
    queryKey: ['laundry-batch-to-send', sendBatchParam],
    queryFn: async () => {
      if (!sendBatchParam) return null
      const { data, error } = await supabase
        .from('laundry_batches')
        .select('id, batch_code, total_items, total_weight_kg')
        .eq('id', sendBatchParam)
        .single()
      if (error) return null
      return data
    },
    enabled: !!sendBatchParam
  })
  
  // Auto-open send dialog when batchToSend is loaded
  useEffect(() => {
    if (batchToSend && sendBatchParam) {
      setSendBatchDialogOpen(true)
    }
  }, [batchToSend, sendBatchParam])
  
  // Clear sendBatch param when dialog closes
  const handleSendDialogChange = (open: boolean) => {
    setSendBatchDialogOpen(open)
    if (!open && sendBatchParam) {
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('sendBatch')
      setSearchParams(newParams)
    }
  }
  
  // Realtime subscription (filter theo tenant + pause khi tab ẩn)
  useEffect(() => {
    if (!tenantId) return
    let channel: ReturnType<typeof supabase.channel> | null = null

    const subscribe = () => {
      if (channel) return
      channel = supabase
        .channel(`laundry-requests-${tenantId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'laundry_requests', filter: `tenant_id=eq.${tenantId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ['laundry-requests'] })
            queryClient.invalidateQueries({ queryKey: ['laundry-requests-pending-count'] })
          }
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'laundry_batches', filter: `tenant_id=eq.${tenantId}` },
          () => queryClient.invalidateQueries({ queryKey: ['draft-laundry-batch'] })
        )
        .subscribe()
    }

    const unsubscribe = () => {
      if (channel) { supabase.removeChannel(channel); channel = null }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        subscribe()
        queryClient.invalidateQueries({ queryKey: ['laundry-requests'] })
        queryClient.invalidateQueries({ queryKey: ['draft-laundry-batch'] })
      } else {
        unsubscribe()
      }
    }

    if (document.visibilityState === 'visible') subscribe()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribe()
    }
  }, [tenantId, queryClient])
  
  // Open confirmation dialog before adding to batch
  const handleOpenConfirmDialog = (request: LaundryRequest) => {
    setSelectedRequest(null) // Close detail sheet
    setConfirmDialogRequest(request)
  }
  
  const handleConfirmAddToBatch = async () => {
    if (!confirmDialogRequest) return
    
    await addToBatch.mutateAsync({
      requestId: confirmDialogRequest.id,
      hotelId: confirmDialogRequest.hotel_id,
    })
    setConfirmDialogRequest(null)
  }
  
  const items = selectedRequest?.items as LaundryRequestItem[] || []
  
  // Format draft batch for dialogs
  const draftBatchForDialog = draftBatch ? {
    id: draftBatch.id,
    batch_code: draftBatch.batch_code,
    total_items: draftBatch.total_items,
    total_weight_kg: draftBatch.total_weight_kg,
  } : null
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            Đồ giặt từ kiểm tra phòng
          </h3>
          <p className="text-sm text-muted-foreground">
            Các yêu cầu giặt tự động tạo sau khi kiểm tra checkout
          </p>
        </div>
        {pendingCount && pendingCount > 0 && (
          <Badge variant="secondary">
            {pendingCount} chờ xử lý
          </Badge>
        )}
      </div>
      
      {/* Draft Batch Info */}
      {draftBatch && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Lô giặt nháp hôm nay</div>
                <div className="text-sm text-muted-foreground">
                  {draftBatch.batch_code} • {draftBatch.total_items || 0} món
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => navigate(`/laundry/batches/${draftBatch.id}`)}
                >
                  Xem lô giặt
                </Button>
                <Button 
                  size="sm"
                  onClick={() => setSendBatchDialogOpen(true)}
                  disabled={(draftBatch.total_items || 0) === 0}
                >
                  <Truck className="h-4 w-4 mr-1" />
                  Gửi đi
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Request List */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))
        ) : requests?.length === 0 ? (
          <Card className="p-6 text-center">
            <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Không có yêu cầu giặt nào đang chờ
            </p>
          </Card>
        ) : (
          requests?.map((request) => {
            const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending
            const StatusIcon = statusConfig.icon
            const requestItems = request.items as LaundryRequestItem[]
            
            return (
              <Card 
                key={request.id}
                className={cn(
                  "hover:bg-muted/50 cursor-pointer transition-colors",
                  request.status === 'pending' && "border-primary/30 bg-primary/5"
                )}
                onClick={() => setSelectedRequest(request)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{request.request_code}</span>
                        <span className={cn("flex items-center gap-1 text-xs", statusConfig.color)}>
                          <StatusIcon className="h-3 w-3" />
                          {statusConfig.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <DoorOpen className="h-3.5 w-3.5" />
                          {request.room?.room_number || 'N/A'}
                        </span>
                        <span>•</span>
                        <span>{request.total_quantity} món</span>
                        <span>•</span>
                        <span>
                          {format(new Date(request.created_at), "HH:mm", { locale: vi })}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
      
      {/* Request Detail Sheet */}
      <Sheet open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              Chi tiết yêu cầu giặt
            </SheetTitle>
            <SheetDescription>
              {selectedRequest?.request_code}
            </SheetDescription>
          </SheetHeader>
          
          {selectedRequest && (
            <div className="space-y-4 mt-6">
              {/* Room Info */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <DoorOpen className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium">
                    Phòng {selectedRequest.room?.room_number || 'N/A'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedRequest.requester?.full_name || 'N/A'} • 
                    {format(new Date(selectedRequest.created_at), " HH:mm dd/MM", { locale: vi })}
                  </div>
                </div>
              </div>
              
              {/* Items */}
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Danh sách đồ giặt ({items.length})
                </h4>
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div 
                      key={`${item.item_id}-${index}`}
                      className="flex items-center justify-between p-2 rounded border"
                    >
                      <div>
                        <div className="font-medium text-sm">{item.item_name}</div>
                        {item.item_code && (
                          <div className="text-xs text-muted-foreground font-mono">
                            {item.item_code}
                          </div>
                        )}
                      </div>
                      <Badge variant="secondary">x{item.quantity}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Total */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5">
                <span className="font-medium">Tổng số</span>
                <span className="text-lg font-bold">{selectedRequest.total_quantity} món</span>
              </div>
              
              {/* Notes */}
              {selectedRequest.notes && (
                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  {selectedRequest.notes}
                </div>
              )}
              
              {/* Batch Info */}
              {selectedRequest.batch && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="text-sm font-medium">
                    Đã thêm vào lô: {selectedRequest.batch.batch_code}
                  </div>
                </div>
              )}
              
              {/* Action */}
              {selectedRequest.status === 'pending' && (
                <Button
                  className="w-full"
                  onClick={() => handleOpenConfirmDialog(selectedRequest)}
                  disabled={addToBatch.isPending}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Thêm vào lô giặt nháp
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      
      {/* Confirmation Dialog */}
      <AddToLaundryBatchDialog
        open={!!confirmDialogRequest}
        onOpenChange={(open) => !open && setConfirmDialogRequest(null)}
        request={confirmDialogRequest}
        draftBatch={draftBatchForDialog}
        onConfirm={handleConfirmAddToBatch}
        isLoading={addToBatch.isPending}
      />
      
      {/* Send Batch Dialog */}
      <SendLaundryBatchDialog
        open={sendBatchDialogOpen}
        onOpenChange={handleSendDialogChange}
        batch={batchToSend || draftBatchForDialog}
        onSuccess={() => handleSendDialogChange(false)}
      />
    </div>
  )
}
