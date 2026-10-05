import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { BatchStatusBadge } from './BatchStatusBadge'
import { StopCard } from './StopCard'
import { useRouteBatches, useHandoverBatch, useReceiveBatch } from '@/hooks/useRouteBatch'
import { useAuth } from '@/contexts/AuthContext'
import type { DistributionBatch, RouteStop, StopStatus } from '@/types/route-batch.types'
import { Package, Truck, Users, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BatchAccordionProps {
  orderId: string
  orderCode?: string
  tenantId?: string
  hotelId?: string
  orderStatus: string
  assignedTo: string | null
  stops: RouteStop[]
  isStorekeeper?: boolean
  isAssignee?: boolean
  isLeader?: boolean
  onStopAction?: () => void
}

export function BatchAccordion({
  orderId,
  orderCode,
  tenantId,
  hotelId,
  orderStatus,
  assignedTo,
  stops,
  isStorekeeper = false,
  isAssignee = false,
  isLeader = false,
  onStopAction,
}: BatchAccordionProps) {
  const { t } = useTranslation('distribution')
  const { user } = useAuth()
  const { data: batches, isLoading } = useRouteBatches(orderId)
  const handoverBatch = useHandoverBatch()
  const receiveBatch = useReceiveBatch()

  // Group stops by batch number
  const stopsByBatch = useMemo(() => stops.reduce((acc, stop) => {
    const batchNum = stop.batch_number || 1
    if (!acc[batchNum]) acc[batchNum] = []
    acc[batchNum].push(stop)
    return acc
  }, {} as Record<number, RouteStop[]>), [stops])

  // Calculate batch stats
  const getBatchStats = (batchStops: RouteStop[]) => {
    const total = batchStops.length
    const delivered = batchStops.filter(s => s.stop_status === 'delivered').length
    const cannotAccess = batchStops.filter(s => s.stop_status === 'cannot_access').length
    const resolved = batchStops.filter(s => s.stop_status === 'resolved').length
    const pending = batchStops.filter(s => s.stop_status === 'pending').length
    return { total, delivered, cannotAccess, resolved, pending }
  }

  const [openItems, setOpenItems] = useState<string[]>([])
  
  // Set default open items when effectiveBatches change
  useEffect(() => {
    if (isLoading) return
    const batchList = (batches && batches.length > 0)
      ? batches
      : Object.keys(stopsByBatch).map(batchNum => ({
          batch_number: parseInt(batchNum),
          status: 'open' as const,
        }))
    
    for (const batch of batchList) {
      if (batch.status !== 'done') {
        setOpenItems([`batch-${batch.batch_number}`])
        return
      }
    }
    if (batchList.length > 0) {
      setOpenItems([`batch-${batchList[0].batch_number}`])
    }
  }, [batches, isLoading, stopsByBatch])

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  // If no batches in DB yet, create a virtual batch from stops
  const effectiveBatches: DistributionBatch[] = (batches && batches.length > 0)
    ? batches
    : Object.keys(stopsByBatch).map(batchNum => ({
        id: `virtual-${batchNum}`,
        distribution_order_id: orderId,
        batch_number: parseInt(batchNum),
        status: 'open' as const,
        created_at: null,
        updated_at: null,
        handed_over_at: null,
        handed_over_by: null,
        received_at: null,
        received_by: null,
      }))

  if (effectiveBatches.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Không có phòng nào trong route này
        </CardContent>
      </Card>
    )
  }

  return (
    <Accordion
      type="multiple"
      value={openItems}
      onValueChange={setOpenItems}
      className="space-y-3"
    >
      {effectiveBatches.map(batch => {
        const batchStops = stopsByBatch[batch.batch_number] || []
        const stats = getBatchStats(batchStops)
        const isVirtual = batch.id.startsWith('virtual-')
        
        // Permission logic for actions
        // Storekeeper can handover when batch is open and order is pending
        const canHandover = isStorekeeper && batch.status === 'open' && !isVirtual && orderStatus === 'pending'
        // Assignee can deliver after confirming receipt (order in_progress) and batch handed_over/received
        const canDeliverStops = isAssignee && 
          orderStatus === 'in_progress' &&
          (batch.status === 'handed_over' || batch.status === 'received' || batch.status === 'done')

        return (
          <AccordionItem
            key={batch.id}
            value={`batch-${batch.batch_number}`}
            className="border rounded-lg overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
              <div className="flex items-center justify-between w-full pr-2">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono">
                    Batch {batch.batch_number}
                  </Badge>
                  <BatchStatusBadge status={batch.status} />
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {/* Stats */}
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {stats.total} phòng
                    </span>
                    {stats.delivered > 0 && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {stats.delivered}
                      </span>
                    )}
                    {stats.cannotAccess > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {stats.cannotAccess} không vào được
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </AccordionTrigger>

            <AccordionContent className="px-4 pb-4">
              {/* Action buttons - Storekeeper handover only */}
              {canHandover && (
                <div className="mb-4">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation()
                      handoverBatch.mutate({ batchId: batch.id })
                    }}
                    disabled={handoverBatch.isPending}
                    className="gap-2"
                  >
                    <Truck className="h-4 w-4" />
                    {handoverBatch.isPending ? 'Đang xử lý...' : 'Giao batch này'}
                  </Button>
                </div>
              )}

              {/* Stops list */}
              <div className="space-y-2">
                {batchStops.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Không có phòng trong batch này
                  </p>
                ) : (
                  batchStops.map(stop => (
                    <StopCard
                      key={stop.id}
                      stop={stop}
                      orderCode={orderCode}
                      tenantId={tenantId}
                      hotelId={hotelId}
                      canDeliver={canDeliverStops && stop.stop_status === 'pending'}
                      canMarkCannotAccess={canDeliverStops && stop.stop_status === 'pending'}
                      canRetry={canDeliverStops && stop.stop_status === 'cannot_access'}
                      canReturnToStock={isAssignee && stop.stop_status === 'cannot_access' && !stop.returned_at}
                      canHandover={isAssignee && stop.stop_status === 'cannot_access' && !!stop.returned_at}
                      onAction={onStopAction}
                    />
                  ))
                )}
              </div>

              {/* Batch timestamps */}
              {(batch.handed_over_at || batch.received_at) && (
                <div className="mt-4 pt-3 border-t text-xs text-muted-foreground space-y-1">
                  {batch.handed_over_at && (
                    <p>Đã giao: {new Date(batch.handed_over_at).toLocaleString('vi-VN')}</p>
                  )}
                  {batch.received_at && (
                    <p>Đã nhận: {new Date(batch.received_at).toLocaleString('vi-VN')}</p>
                  )}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}
