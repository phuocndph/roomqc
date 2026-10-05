import { useState, useEffect, useRef } from 'react'
import { differenceInSeconds } from 'date-fns'
import { Loader2, Clock, X, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCheckoutInspection } from '@/hooks/useCheckoutInspection'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import type { BookingCostBreakdown, DamageChargeItem } from '@/lib/bookingCalculations'

export interface MinimizedCheckout {
  booking: {
    id: string
    guest_name: string
    room_id: string
    hotel_id: string
    check_out_date: string
    room?: {
      room_number: string
    }
  }
  costBreakdown: BookingCostBreakdown
  damageItems: DamageChargeItem[]
  actualCheckoutTime: string
  actualCheckoutDate: Date
  scheduledCheckoutDate: Date
  // Group checkout fields
  isGroup?: boolean
  bookingGroupId?: string
  groupRoomCount?: number
}

interface MinimizedCheckoutWidgetProps {
  checkout: MinimizedCheckout
  onRestore: (checkout: MinimizedCheckout) => void
  onClose: (bookingId: string) => void
  tenantId?: string
}

export function MinimizedCheckoutWidget({
  checkout,
  onRestore,
  onClose,
  tenantId,
}: MinimizedCheckoutWidgetProps) {
  const [showConfirmClose, setShowConfirmClose] = useState(false)
  const [elapsedTime, setElapsedTime] = useState('')
  
  const { inspection, refetch } = useCheckoutInspection(checkout.isGroup ? undefined : checkout.booking.id)
  const inspectionId = inspection?.id
  const inspectionStatus = inspection?.status
  const inspectionStartedAt = inspection?.started_at
  
  // Ref to ensure we only notify once per inspection completion
  const notifiedCompletedRef = useRef(false)
  
  // Timer for in_progress inspection
  useEffect(() => {
    if (inspectionStatus !== 'in_progress' || !inspectionStartedAt) {
      setElapsedTime('')
      return
    }
    
    const updateTimer = () => {
      const startTime = new Date(inspectionStartedAt)
      const now = new Date()
      const seconds = differenceInSeconds(now, startTime)
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      setElapsedTime(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`)
    }
    
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    
    return () => clearInterval(interval)
  }, [inspectionStatus, inspectionStartedAt])
  
  // Polling fallback when inspection is active
  useEffect(() => {
    if (!inspectionId || !inspectionStatus) return
    if (inspectionStatus === 'completed' || inspectionStatus === 'cancelled') return
    
    const intervalMs = inspectionStatus === 'in_progress' ? 2000 : 3000
    const interval = setInterval(() => {
      refetch()
    }, intervalMs)
    
    return () => clearInterval(interval)
  }, [inspectionId, inspectionStatus, refetch])
  
  // Notify when inspection completed - only once per inspection
  useEffect(() => {
    // Reset ref when inspection changes or is not completed
    if (inspectionStatus !== 'completed') {
      notifiedCompletedRef.current = false
      return
    }
    
    // Only notify once
    if (notifiedCompletedRef.current) return
    notifiedCompletedRef.current = true
    
    toast.success(`Kiểm tra phòng ${checkout.booking.room?.room_number || ''} hoàn tất`, {
      description: 'Nhấn "Mở lại" để xem kết quả',
    })
  }, [inspectionStatus, checkout.booking.room?.room_number])
  
  const roomNumber = checkout.isGroup
    ? `${checkout.groupRoomCount || 0} phòng`
    : `P.${checkout.booking.room?.room_number || 'N/A'}`
  const guestName = checkout.booking.guest_name
  
  const getStatusDisplay = () => {
    if (!inspection || inspection.status === 'cancelled') {
      return (
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className="text-xs">Chờ checkout</span>
        </div>
      )
    }
    
    if (inspection.status === 'completed') {
      return (
        <div className="flex items-center gap-1 text-green-600">
          <CheckCircle2 className="h-3 w-3" />
          <span className="text-xs">Đã kiểm tra</span>
        </div>
      )
    }
    
    if (inspection.status === 'in_progress') {
      return (
        <div className="flex items-center gap-1 text-primary">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-xs font-mono">{elapsedTime || '00:00'}</span>
        </div>
      )
    }
    
    // pending
    return (
      <div className="flex items-center gap-1 text-amber-600">
        <ClipboardCheck className="h-3 w-3" />
        <span className="text-xs">Chờ kiểm tra</span>
      </div>
    )
  }
  
  const handleClose = () => {
    // If inspection is active, confirm before closing
    if (inspection && ['pending', 'in_progress'].includes(inspection.status)) {
      setShowConfirmClose(true)
    } else {
      onClose(checkout.booking.id)
    }
  }
  
  return (
    <>
      <div
        className={cn(
          "w-56 rounded-lg border bg-card shadow-lg p-2",
          "animate-in slide-in-from-right-5 duration-200",
          inspection?.status === 'completed' && "border-green-500 bg-green-50 dark:bg-green-950"
        )}
      >
        {/* Header - compact */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="font-medium text-sm">{roomNumber}</span>
            <span className="text-xs text-muted-foreground truncate">{guestName}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 -mr-1"
            onClick={handleClose}
           aria-label="Đóng">
            <X className="h-3 w-3" />
          </Button>
        </div>
        
        {/* Status + Action same row */}
        <div className="flex items-center justify-between">
          {getStatusDisplay()}
          <Button
            variant={inspection?.status === 'completed' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => onRestore(checkout)}
          >
            Mở lại
          </Button>
        </div>
      </div>
      
      {/* Confirm close dialog */}
      <AlertDialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Đóng checkout?</AlertDialogTitle>
            <AlertDialogDescription>
              Phòng {roomNumber} đang có yêu cầu kiểm tra chưa hoàn tất. 
              Bạn có chắc muốn đóng? Dữ liệu checkout sẽ không được lưu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onClose(checkout.booking.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Đóng
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
