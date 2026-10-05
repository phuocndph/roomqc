import { useState, useMemo, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { AlertTriangle, CreditCard, Receipt, Clock, Check, Printer, Minimize2, ShoppingBag, User, DoorOpen, ChevronDown, ChevronRight, Search, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { BookingPaymentDialog } from '@/components/bookings/BookingPaymentDialog'
import type { ServiceChargeDetail } from '@/hooks/useBookingServiceCharges'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/utils'
import { 
  BookingCostBreakdown, 
  getLateCheckoutDescription,
  calculateBookingCost,
  parseTimeToHours,
  isEarlyCheckout,
  DEFAULT_PRICING_RULES,
  DamageChargeItem
} from '@/lib/bookingCalculations'
import { cn } from '@/lib/utils'
import { DamageChargesSection } from './DamageChargesSection'
import { DamageReportDocument } from './DamageReportDocument'
import { CheckoutInspectionSection } from './CheckoutInspectionSection'
import { useCheckoutInspection } from '@/hooks/useCheckoutInspection'
import { sendPushNotification, createInAppNotification, sendTelegramNotification } from '@/hooks/useNotificationTriggers'
import { supabase } from '@/integrations/supabase/client'
import type { Json } from '@/integrations/supabase/types'

// Late checkout surcharge tiers
const LATE_CHECKOUT_TIERS = [
  { id: 'before12', label: 'Trước 12:00', percent: 0, description: 'Miễn phí', minHour: 0, maxHour: 12 },
  { id: '12to15', label: '12:00 - 15:00', percent: 30, description: '', minHour: 12, maxHour: 15 },
  { id: '15to18', label: '15:00 - 18:00', percent: 50, description: '', minHour: 15, maxHour: 18 },
  { id: 'after18', label: 'Sau 18:00', percent: 100, description: '= 1 đêm', minHour: 18, maxHour: 24 },
]

interface CheckoutSummaryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  guestName: string
  roomNumber: string
  actualCheckoutTime: string
  actualCheckoutDate: Date
  scheduledCheckoutDate: Date
  costBreakdown: BookingCostBreakdown
  // Booking type support
  bookingType?: 'daily' | 'hourly' | 'monthly'
  hourlyRate?: number
  bookingHours?: number
  scheduledEndTime?: Date
  monthlyRate?: number
  bookingMonths?: number
  // Damage charges
  damageItems?: DamageChargeItem[]
  onConfirmCheckout: (
    adjustedLateCharge: number, 
    adjustmentNote?: string,
    damageCharges?: number,
    damageAdjustmentNote?: string,
    adjustedDamageItems?: DamageChargeItem[]
  ) => void
  onPayAndCheckout: (
    adjustedLateCharge: number, 
    adjustmentNote?: string,
    damageCharges?: number,
    damageAdjustmentNote?: string,
    adjustedDamageItems?: DamageChargeItem[]
  ) => void
  isLoading?: boolean
  hotelInfo?: {
    name: string
    address?: string
    phone?: string
  }
  // Checkout inspection props
  bookingId?: string
  roomId?: string
  hotelId?: string
  tenantId?: string
  // Callback when inspection is completed - parent can refetch damage items
  onInspectionCompleted?: (roomCheckId: string) => void
  // Minimize callback - allows minimizing dialog while waiting for inspection
  onMinimize?: () => void
  // Skip completion toast - used when restoring from minimized widget (widget already showed toast)
  skipCompletionToast?: boolean
  // Service charge details for breakdown display
  serviceChargeDetails?: ServiceChargeDetail[]
}

export function CheckoutSummaryDialog({
  open,
  onOpenChange,
  guestName,
  roomNumber,
  actualCheckoutTime,
  actualCheckoutDate,
  scheduledCheckoutDate,
  costBreakdown,
  // Booking type props
  bookingType = 'daily',
  hourlyRate,
  bookingHours,
  scheduledEndTime,
  monthlyRate,
  bookingMonths,
  damageItems: initialDamageItems = [],
  onConfirmCheckout,
  onPayAndCheckout,
  isLoading = false,
  hotelInfo,
  // Checkout inspection props
  bookingId,
  roomId,
  hotelId,
  tenantId,
  onInspectionCompleted,
  onMinimize,
  skipCompletionToast = false,
  serviceChargeDetails = [],
}: CheckoutSummaryDialogProps) {
  const [adjustedLateCharge, setAdjustedLateCharge] = useState(costBreakdown.lateCheckoutCharge)
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [isPreparingPayment, setIsPreparingPayment] = useState(false)
  const [showDebtConfirm, setShowDebtConfirm] = useState(false)
  
  // Damage charge states
  const [adjustedDamageItems, setAdjustedDamageItems] = useState<DamageChargeItem[]>(initialDamageItems)
  const [damageAdjustmentNote, setDamageAdjustmentNote] = useState('')
  const [showDamageReport, setShowDamageReport] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)
  
  // Checkout inspection hook
  const {
    inspection,
    isLoading: isLoadingInspection,
    createInspection,
    cancelInspection,
    refetch: refetchInspection,
  } = useCheckoutInspection(bookingId)
  const inspectionId = inspection?.id
  const inspectionStatus = inspection?.status
  const inspectionRoomCheckId = inspection?.room_check_id
  const inspectionAssigneeName = inspection?.assigned_user?.full_name

  // Reset when dialog opens or costBreakdown changes
  useEffect(() => {
    if (open) {
      setAdjustedLateCharge(costBreakdown.lateCheckoutCharge)
      setAdjustmentNote('')
      setAdjustedDamageItems(initialDamageItems)
      setDamageAdjustmentNote('')
      setShowDamageReport(false)
    }
  }, [open, costBreakdown.lateCheckoutCharge, initialDamageItems])
  
  // Sync adjustedDamageItems when initialDamageItems changes from parent
  // (happens when inspection completed and parent refetches damage items)
  useEffect(() => {
    // Only sync if there are new items from parent that we don't have locally
    const hasNewItems = initialDamageItems.length > 0 && 
      (adjustedDamageItems.length === 0 || 
       initialDamageItems.some(newItem => 
         !adjustedDamageItems.find(existingItem => existingItem.item_id === newItem.item_id)
       ))
    
    if (hasNewItems) {
      
      setAdjustedDamageItems(initialDamageItems)
    }
  }, [initialDamageItems, adjustedDamageItems])
  
  // Polling fallback: khi dialog mở và inspection đang pending/in_progress
  // Polling nhanh hơn (2s) khi đang in_progress để cập nhật timer chính xác
  useEffect(() => {
    if (!open) return
    if (!inspectionId || !inspectionStatus) return
    if (inspectionStatus === 'completed' || inspectionStatus === 'cancelled') return
    
    // Polling nhanh hơn khi đang in_progress
    const intervalMs = inspectionStatus === 'in_progress' ? 2000 : 3000
    
    const interval = setInterval(() => {
      
      refetchInspection()
    }, intervalMs)
    
    return () => clearInterval(interval)
  }, [open, inspectionId, inspectionStatus, refetchInspection])

  // Track when inspection is completed and notify parent to refetch damage items
  const lastNotifiedCheckId = useRef<string | null>(null)
  
  useEffect(() => {
    if (inspectionStatus !== 'completed' || !inspectionRoomCheckId) return
    
    // Only notify once per room_check_id
    if (lastNotifiedCheckId.current === inspectionRoomCheckId) return
    
    
    lastNotifiedCheckId.current = inspectionRoomCheckId
    
    // Show toast notification immediately - unless widget already showed it
    if (!skipCompletionToast) {
      toast.success('Kiểm tra phòng hoàn tất', {
        description: `Nhân viên ${inspectionAssigneeName || ''} đã hoàn thành. Kết quả đã cập nhật.`,
      })
    }
    
    // Notify parent to refetch damage items
    onInspectionCompleted?.(inspectionRoomCheckId)
  }, [inspectionStatus, inspectionRoomCheckId, inspectionAssigneeName, onInspectionCompleted, skipCompletionToast])

  // Calculate total damage charge
  const totalDamageCharge = useMemo(() => {
    return adjustedDamageItems.reduce((sum, item) => sum + item.charge_amount * item.quantity, 0)
  }, [adjustedDamageItems])

  // Check if damage charges were adjusted
  const isDamageAdjusted = useMemo(() => {
    if (adjustedDamageItems.length !== initialDamageItems.length) return true
    return adjustedDamageItems.some(item => {
      const original = initialDamageItems.find(i => i.item_id === item.item_id)
      return !original || original.charge_amount !== item.charge_amount
    })
  }, [adjustedDamageItems, initialDamageItems])

  const needsDamageNote = isDamageAdjusted && totalDamageCharge < 
    initialDamageItems.reduce((sum, i) => sum + i.charge_amount * i.quantity, 0) && 
    !damageAdjustmentNote.trim()

  // Recalculate cost breakdown with adjusted late charge AND damage charges
  const adjustedCostBreakdown = useMemo(() => {
    // Calculate hourly overtime if applicable
    const hourlyOvertimeCharge = bookingType === 'hourly' && scheduledEndTime
      ? Math.max(0, adjustedLateCharge) // adjustedLateCharge holds overtime for hourly
      : 0

    return calculateBookingCost({
      bookingType,
      roomPrice: costBreakdown.roomPricePerNight,
      nights: costBreakdown.nights,
      earlyCheckinCharge: bookingType === 'daily' ? costBreakdown.earlyCheckinCharge : 0,
      lateCheckoutCharge: bookingType === 'daily' ? adjustedLateCharge : 0,
      hourlyRate: hourlyRate || 0,
      hours: bookingHours || 0,
      hourlyOvertimeCharge,
      monthlyRate: monthlyRate || 0,
      months: bookingMonths || 0,
      serviceCharges: costBreakdown.serviceCharges,
      extraCharges: costBreakdown.extraCharges,
      damageCharges: totalDamageCharge,
      damageItems: adjustedDamageItems,
      vatRate: costBreakdown.vatRate,
      serviceFeeRate: costBreakdown.serviceFeeRate,
      depositAmount: costBreakdown.depositAmount,
      amountPaid: costBreakdown.amountPaid,
    })
  }, [costBreakdown, adjustedLateCharge, totalDamageCharge, adjustedDamageItems, bookingType, hourlyRate, bookingHours, monthlyRate, bookingMonths, scheduledEndTime])

  // Check if this is an early checkout (before scheduled date) - only for daily
  const isEarlyCheckoutCase = bookingType === 'daily' && isEarlyCheckout(actualCheckoutDate, scheduledCheckoutDate)
  
  // Determine which tier applies (only for daily and NOT early checkout)
  const currentHour = parseTimeToHours(actualCheckoutTime)
  const activeTier = bookingType === 'daily' && !isEarlyCheckoutCase 
    ? LATE_CHECKOUT_TIERS.find(tier => currentHour >= tier.minHour && currentHour < tier.maxHour)
    : null
  
  const lateCheckoutDesc = bookingType === 'daily' 
    ? getLateCheckoutDescription(actualCheckoutTime, actualCheckoutDate, scheduledCheckoutDate)
    : null
  const hasOutstandingBalance = adjustedCostBreakdown.remainingAmount > 0

  // Check if charge was adjusted
  const isAdjusted = adjustedLateCharge !== costBreakdown.lateCheckoutCharge
  const needsNote = bookingType === 'daily' && isAdjusted && adjustedLateCharge < costBreakdown.lateCheckoutCharge && !adjustmentNote.trim()
  
  const handleWaive = () => {
    setAdjustedLateCharge(0)
  }

  const handleResetToStandard = () => {
    setAdjustedLateCharge(costBreakdown.lateCheckoutCharge)
    setAdjustmentNote('')
  }

  // Damage item handlers
  const handleAdjustDamageCharge = (itemId: string, newCharge: number) => {
    setAdjustedDamageItems(prev => 
      prev.map(item => item.item_id === itemId ? { ...item, charge_amount: newCharge } : item)
    )
  }

  const handleWaiveDamageItem = (itemId: string) => {
    setAdjustedDamageItems(prev => 
      prev.map(item => item.item_id === itemId ? { ...item, charge_amount: 0 } : item)
    )
  }

  const handleResetDamageItem = (itemId: string) => {
    const original = initialDamageItems.find(i => i.item_id === itemId)
    if (original) {
      setAdjustedDamageItems(prev => 
        prev.map(item => item.item_id === itemId ? { ...item, charge_amount: original.charge_amount } : item)
      )
    }
  }

  const handlePrintReport = () => {
    setShowDamageReport(true)
    setTimeout(() => {
      if (reportRef.current) {
        const printWindow = window.open('', '_blank')
        if (printWindow) {
          printWindow.document.write('<html><head><title>Biên bản thiệt hại</title>')
          printWindow.document.write('<style>body { font-family: Arial, sans-serif; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ccc; padding: 8px; }</style>')
          printWindow.document.write('</head><body>')
          printWindow.document.write(reportRef.current.innerHTML)
          printWindow.document.write('</body></html>')
          printWindow.document.close()
          printWindow.print()
        }
      }
      setShowDamageReport(false)
    }, 100)
  }

  const handleConfirm = () => {
    const combinedNote = [
      isAdjusted ? adjustmentNote : '',
      isDamageAdjusted ? damageAdjustmentNote : ''
    ].filter(Boolean).join(' | ')
    
    onConfirmCheckout(
      adjustedLateCharge, 
      isAdjusted ? adjustmentNote : undefined,
      totalDamageCharge,
      isDamageAdjusted ? damageAdjustmentNote : undefined,
      adjustedDamageItems
    )
  }

  const handlePayAndCheckout = async () => {
    if (!bookingId || !roomId || !tenantId || !hotelId) {
      toast.error('Thiếu thông tin booking để tạo khoản thu')
      return
    }

    setIsPreparingPayment(true)
    try {
      // Persist the exact quote before creating a payment.  Without this step
      // the payment RPC would only see the old booking total and reject (or
      // under-collect) newly added late/damage/service charges.
      const { error } = await supabase.rpc('prepare_checkout_amounts', {
        p_booking_id: bookingId,
        p_room_id: roomId,
        p_late_checkout_charge: adjustedLateCharge,
        p_service_charges: adjustedCostBreakdown.serviceCharges,
        p_subtotal: adjustedCostBreakdown.subtotal,
        p_damage_charges: totalDamageCharge,
        p_damage_notes: isDamageAdjusted ? damageAdjustmentNote : null,
        p_damage_items: adjustedDamageItems as unknown as Json,
      })
      if (error) throw error
      setShowPaymentDialog(true)
    } catch (error) {
      console.error('Prepare checkout payment error:', error)
      toast.error('Không thể lưu tổng tiền checkout')
    } finally {
      setIsPreparingPayment(false)
    }
  }

  // Callback sau khi thanh toán xong từ BookingPaymentDialog
  const handlePaymentComplete = () => {
    setShowPaymentDialog(false)
    // Gọi callback checkout sau khi thanh toán xong
    onPayAndCheckout(
      adjustedLateCharge, 
      isAdjusted ? adjustmentNote : undefined,
      totalDamageCharge,
      isDamageAdjusted ? damageAdjustmentNote : undefined,
      adjustedDamageItems
    )
  }

  // Inspection handlers
  const handleCreateInspection = async (assignedTo: string, staffName: string) => {
    if (!tenantId || !hotelId || !roomId) return
    await createInspection.mutateAsync({
      tenantId,
      hotelId,
      roomId,
      assignedTo,
    })
    // Send notifications to assigned staff - actionUrl points to /my-tasks
    await Promise.all([
      // 1. Push notification to individual staff
      sendPushNotification({
        userId: assignedTo,
        tenantId,
        title: `Yêu cầu kiểm tra phòng ${roomNumber}`,
        body: `Khách ${guestName} sắp checkout. Vui lòng kiểm tra phòng.`,
        actionUrl: `/my-tasks`,
        notificationType: 'room_checkout',
      }),
      // 2. In-app notification to individual staff
      createInAppNotification({
        userId: assignedTo,
        tenantId,
        title: `Yêu cầu kiểm tra phòng ${roomNumber}`,
        body: `Khách ${guestName} sắp checkout. Vui lòng kiểm tra phòng.`,
        type: 'room_checkout',
        actionUrl: `/my-tasks`,
      }),
      // 3. Telegram to individual staff
      sendTelegramNotification({
        tenantId,
        hotelId,
        userIds: [assignedTo],
        title: `🔍 Yêu cầu kiểm tra phòng ${roomNumber}`,
        message: `Khách: ${guestName}\nVui lòng kiểm tra phòng trước khi checkout.`,
        notificationType: 'checkout',
        actionUrl: `/my-tasks`,
      }),
      // 4. Telegram to staff groups of this hotel
      sendTelegramNotification({
        tenantId,
        hotelId,
        sendToStaffGroups: true,
        title: `🔍 Yêu cầu kiểm tra phòng ${roomNumber}`,
        message: `Khách: ${guestName}\n👤 Giao cho: ${staffName}\nVui lòng kiểm tra phòng trước khi checkout.`,
        notificationType: 'checkout',
        actionUrl: `/my-tasks`,
      }),
    ])
  }

  const handleCancelInspection = async (inspectionId: string) => {
    await cancelInspection.mutateAsync(inspectionId)
  }

  const canProceed = !needsNote && !needsDamageNote
  
  // Collapsible states
  const [showServiceDetails, setShowServiceDetails] = useState(false)
  const [showLateTiers, setShowLateTiers] = useState(false)

  // Booking type label
  const bookingTypeLabel = bookingType === 'hourly' ? 'giờ' : bookingType === 'monthly' ? 'tháng' : 'đêm'

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-xl w-[95vw] max-h-[90vh] flex flex-col p-0">
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" />
            Xác nhận Check-out
          </AlertDialogTitle>
          <div className="flex items-center gap-1">
            {onMinimize && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onMinimize}
                title="Thu nhỏ"
               aria-label="Thu nhỏ">
                <Minimize2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <AlertDialogHeader className="flex-1 overflow-y-auto px-4 pb-2">
          <AlertDialogDescription asChild>
            <div className="space-y-3">

              {/* === CARD 1: Guest & Room Info === */}
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-foreground text-base">{guestName}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <DoorOpen className="h-3.5 w-3.5" />
                        P.{roomNumber}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {actualCheckoutTime}
                      </span>
                    </div>
                  </div>
                  {/* Status badge */}
                  {isEarlyCheckoutCase ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <Check className="h-3 w-3" /> Checkout sớm
                    </span>
                  ) : currentHour <= 12 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <Check className="h-3 w-3" /> Đúng giờ
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <Clock className="h-3 w-3" /> Trễ giờ
                    </span>
                  )}
                </div>
                {lateCheckoutDesc && currentHour > 12 && (
                  <p className="text-xs text-amber-600 mt-1.5">{lateCheckoutDesc}</p>
                )}
              </div>

              {/* === CARD 2: Room Inspection === */}
              {bookingId && roomId && hotelId && tenantId && (
                <div className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Kiểm tra phòng</span>
                  </div>
                  <CheckoutInspectionSection
                    bookingId={bookingId}
                    roomId={roomId}
                    hotelId={hotelId}
                    tenantId={tenantId}
                    inspection={inspection || null}
                    isLoadingInspection={isLoadingInspection}
                    onCreateInspection={handleCreateInspection}
                    onCancelInspection={handleCancelInspection}
                  />
                </div>
              )}

              {/* === CARD 3: Late Checkout / Overtime (only when applicable) === */}
              {bookingType === 'daily' && !isEarlyCheckoutCase && currentHour > 12 && (
                <div className="border rounded-lg p-3 border-amber-200 dark:border-amber-800">
                  <button
                    type="button"
                    className="flex items-center justify-between w-full text-sm"
                    onClick={() => setShowLateTiers(!showLateTiers)}
                  >
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      Phụ thu trễ giờ: {activeTier?.label} ({activeTier?.percent}%)
                    </span>
                    {showLateTiers ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  
                  {/* Collapsed tier table */}
                  {showLateTiers && (
                    <div className="mt-2 divide-y border rounded text-xs">
                      {LATE_CHECKOUT_TIERS.map((tier) => {
                        const isActive = tier.id === activeTier?.id
                        const tierAmount = Math.round(costBreakdown.roomPricePerNight * tier.percent / 100)
                        return (
                          <div
                            key={tier.id}
                            className={cn(
                              "flex items-center justify-between px-2 py-1.5",
                              isActive && "bg-amber-50 dark:bg-amber-950/30 font-medium"
                            )}
                          >
                            <span>{tier.label} {tier.description && `(${tier.description})`}</span>
                            <span className="font-mono">{tier.percent}% = {formatCurrency(tierAmount)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Editable charge */}
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      className="w-28 h-7 text-right font-mono text-sm"
                      value={adjustedLateCharge > 0 ? adjustedLateCharge.toString() : ''}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '')
                        setAdjustedLateCharge(parseInt(value) || 0)
                      }}
                      placeholder="0"
                    />
                    <span className="text-xs text-muted-foreground">đ</span>
                    <div className="flex gap-1 ml-auto">
                      <Button type="button" variant="ghost" size="sm" onClick={handleWaive} className="h-6 text-xs text-green-600" disabled={adjustedLateCharge === 0}>
                        Miễn
                      </Button>
                      {isAdjusted && (
                        <Button type="button" variant="ghost" size="sm" onClick={handleResetToStandard} className="h-6 text-xs">
                          Chuẩn
                        </Button>
                      )}
                    </div>
                  </div>
                  {isAdjusted && adjustedLateCharge < costBreakdown.lateCheckoutCharge && (
                    <div className="mt-1.5">
                      <Textarea placeholder="Lý do điều chỉnh..." className="h-10 text-xs" value={adjustmentNote} onChange={(e) => setAdjustmentNote(e.target.value)} />
                      {needsNote && <p className="text-xs text-destructive mt-0.5">Vui lòng nhập lý do</p>}
                    </div>
                  )}
                </div>
              )}

              {/* Hourly overtime card */}
              {bookingType === 'hourly' && adjustedCostBreakdown.hourlyOvertimeCharge && adjustedCostBreakdown.hourlyOvertimeCharge > 0 && (
                <div className="border rounded-lg p-3 border-amber-200 dark:border-amber-800">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-amber-700 dark:text-amber-400 font-medium">Phí vượt giờ</Label>
                    <div className="flex items-center gap-1">
                      <Input type="text" inputMode="numeric" className="w-28 h-7 text-right font-mono text-sm" value={adjustedLateCharge > 0 ? adjustedLateCharge.toString() : ''} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setAdjustedLateCharge(parseInt(v) || 0) }} placeholder="0" />
                      <span className="text-xs text-muted-foreground">đ</span>
                    </div>
                  </div>
                  <div className="flex gap-1 mt-1">
                    <Button type="button" variant="ghost" size="sm" onClick={handleWaive} className="h-6 text-xs text-green-600" disabled={adjustedLateCharge === 0}>Miễn</Button>
                  </div>
                </div>
              )}

              {/* === CARD 4: Payment Breakdown === */}
              <div className="border rounded-lg p-3">
                <h4 className="text-sm font-medium text-foreground mb-2">Chi tiết thanh toán</h4>
                
                <div className="space-y-1.5 text-sm">
                  {/* Room charge */}
                  {bookingType === 'hourly' ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tiền phòng ({bookingHours} giờ × {formatCurrency(hourlyRate || 0)})</span>
                      <span className="font-mono">{formatCurrency(adjustedCostBreakdown.roomTotal)}</span>
                    </div>
                  ) : bookingType === 'monthly' ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tiền phòng ({bookingMonths} tháng × {formatCurrency(monthlyRate || 0)})</span>
                        <span className="font-mono">{formatCurrency((monthlyRate || 0) * (bookingMonths || 1))}</span>
                      </div>
                      {adjustedCostBreakdown.monthlyDiscount && adjustedCostBreakdown.monthlyDiscount > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Chiết khấu dài hạn</span>
                          <span className="font-mono">-{formatCurrency(adjustedCostBreakdown.monthlyDiscount)}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tiền phòng ({adjustedCostBreakdown.nights} đêm × {formatCurrency(adjustedCostBreakdown.roomPricePerNight)})</span>
                      <span className="font-mono">{formatCurrency(adjustedCostBreakdown.roomTotal)}</span>
                    </div>
                  )}
                  
                  {/* Early check-in */}
                  {bookingType === 'daily' && adjustedCostBreakdown.earlyCheckinCharge > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phụ thu check-in sớm</span>
                      <span className="font-mono">{formatCurrency(adjustedCostBreakdown.earlyCheckinCharge)}</span>
                    </div>
                  )}
                  
                  {/* Late checkout */}
                  {bookingType === 'daily' && !isEarlyCheckoutCase && adjustedCostBreakdown.lateCheckoutCharge > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Phụ thu trễ giờ</span>
                      <span className="font-mono">{formatCurrency(adjustedCostBreakdown.lateCheckoutCharge)}</span>
                    </div>
                  )}

                  {/* Hourly overtime in breakdown */}
                  {bookingType === 'hourly' && adjustedCostBreakdown.hourlyOvertimeCharge && adjustedCostBreakdown.hourlyOvertimeCharge > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Phí vượt giờ</span>
                      <span className="font-mono">{formatCurrency(adjustedCostBreakdown.hourlyOvertimeCharge)}</span>
                    </div>
                  )}
                  
                  {/* Services - Collapsible */}
                  {adjustedCostBreakdown.serviceCharges > 0 && (
                    <div>
                      <button
                        type="button"
                        className="flex items-center justify-between w-full py-0.5"
                        onClick={() => setShowServiceDetails(!showServiceDetails)}
                      >
                        <span className="flex items-center gap-1 text-muted-foreground">
                          {showServiceDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          <ShoppingBag className="h-3 w-3" />
                          Dịch vụ sử dụng
                        </span>
                        <span className="font-mono">{formatCurrency(adjustedCostBreakdown.serviceCharges)}</span>
                      </button>
                      {showServiceDetails && serviceChargeDetails.length > 0 && (
                        <div className="pl-6 mt-1 space-y-0.5">
                          {serviceChargeDetails.filter(d => d.source === 'service').map(d => (
                            <div key={d.id} className="flex justify-between text-xs text-muted-foreground">
                              <span>{d.service_name} ×{d.quantity}</span>
                              <span className="font-mono">{formatCurrency(d.total_price)}</span>
                            </div>
                          ))}
                          {serviceChargeDetails.filter(d => d.source === 'minibar').length > 0 && (
                            <>
                              <span className="text-xs text-muted-foreground font-medium">Minibar:</span>
                              {serviceChargeDetails.filter(d => d.source === 'minibar').map(d => (
                                <div key={d.id} className="flex justify-between text-xs text-muted-foreground">
                                  <span>{d.service_name} ×{d.quantity}</span>
                                  <span className="font-mono">{formatCurrency(d.total_price)}</span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {adjustedCostBreakdown.extraCharges > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Chi phí khác</span>
                      <span className="font-mono">{formatCurrency(adjustedCostBreakdown.extraCharges)}</span>
                    </div>
                  )}
                </div>

                {/* Damage Charges */}
                {adjustedDamageItems.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <DamageChargesSection
                      damageItems={adjustedDamageItems}
                      originalItems={initialDamageItems}
                      onAdjustCharge={handleAdjustDamageCharge}
                      onWaiveItem={handleWaiveDamageItem}
                      onResetItem={handleResetDamageItem}
                    />
                    {isDamageAdjusted && totalDamageCharge < initialDamageItems.reduce((s, i) => s + i.charge_amount * i.quantity, 0) && (
                      <div className="mt-1.5">
                        <Textarea placeholder="Lý do điều chỉnh phí đền bù..." className="h-10 text-xs" value={damageAdjustmentNote} onChange={(e) => setDamageAdjustmentNote(e.target.value)} />
                        {needsDamageNote && <p className="text-xs text-red-500 mt-0.5">Vui lòng nhập lý do</p>}
                      </div>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={handlePrintReport} className="w-full gap-2 h-7 mt-2 text-xs">
                      <Printer className="h-3 w-3" />
                      In biên bản xác nhận
                    </Button>
                  </div>
                )}

                {/* Totals section */}
                <div className="mt-3 pt-2 border-t space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatCurrency(adjustedCostBreakdown.subtotal)}</span>
                  </div>
                  {adjustedCostBreakdown.vatRate > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>VAT ({adjustedCostBreakdown.vatRate}%) <span className="text-xs text-muted-foreground">(trên dịch vụ)</span></span>
                      <span className="font-mono">{formatCurrency(adjustedCostBreakdown.vatAmount)}</span>
                    </div>
                  )}
                  {adjustedCostBreakdown.serviceFeeRate > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Phí dịch vụ ({adjustedCostBreakdown.serviceFeeRate}%)</span>
                      <span className="font-mono">{formatCurrency(adjustedCostBreakdown.serviceFeeAmount)}</span>
                    </div>
                  )}
                </div>

                {/* Grand total + Remaining - PROMINENT */}
                <div className="mt-2 pt-2 border-t-2 border-foreground/20 space-y-1">
                  <div className="flex justify-between font-bold text-foreground">
                    <span>TỔNG CỘNG</span>
                    <span className="font-mono text-base">{formatCurrency(adjustedCostBreakdown.totalAmount)}</span>
                  </div>
                  {adjustedCostBreakdown.depositAmount > 0 && (
                    <div className="flex justify-between text-green-600 text-sm">
                      <span>Tiền đặt cọc</span>
                      <span className="font-mono">-{formatCurrency(adjustedCostBreakdown.depositAmount)}</span>
                    </div>
                  )}
                  {adjustedCostBreakdown.amountPaid > 0 && (
                    <div className="flex justify-between text-green-600 text-sm">
                      <span>Đã thanh toán</span>
                      <span className="font-mono">-{formatCurrency(adjustedCostBreakdown.amountPaid)}</span>
                    </div>
                  )}
                  <div className={cn(
                    "flex justify-between font-bold text-lg pt-1",
                    hasOutstandingBalance ? "text-red-600" : "text-green-600"
                  )}>
                    <span>CÒN LẠI</span>
                    <span className="font-mono">{formatCurrency(adjustedCostBreakdown.remainingAmount)}</span>
                  </div>
                </div>
              </div>

            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        {/* Sticky Footer */}
        <div className="border-t px-4 py-3 space-y-2 bg-background">
          {/* Warning */}
          {hasOutstandingBalance && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs text-amber-700 dark:text-amber-400">Khách chưa thanh toán đầy đủ</span>
            </div>
          )}
          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={isLoading} className="w-full sm:w-auto h-9">Hủy</AlertDialogCancel>
            {hasOutstandingBalance ? (
              <>
                <>
                  <Button
                    variant="outline"
                    onClick={() => setShowDebtConfirm(true)}
                    disabled={isLoading || !canProceed}
                    className="w-full sm:w-auto h-9 text-sm border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    Nợ ({formatCurrency(adjustedCostBreakdown.remainingAmount)})
                  </Button>
                  <AlertDialog open={showDebtConfirm} onOpenChange={setShowDebtConfirm}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-amber-500" />
                          Xác nhận cho nợ?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Khách <b>{guestName || 'Khách'}</b> chưa thanh toán{' '}
                          <span className="font-semibold text-red-600">
                            {formatCurrency(adjustedCostBreakdown.remainingAmount)}
                          </span>
                          . Xác nhận checkout và ghi nhận khoản nợ này?
                          <br />
                          <span className="text-xs text-muted-foreground mt-1 block">
                            Khoản nợ sẽ được ghi vào lịch sử booking. Hành động này không thể hoàn tác.
                          </span>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Quay lại thu tiền</AlertDialogCancel>
                        <Button
                          variant="destructive"
                          onClick={() => {
                            setShowDebtConfirm(false)
                            handleConfirm()
                          }}
                          disabled={isLoading}
                        >
                          Xác nhận cho nợ
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
                <Button onClick={handlePayAndCheckout} disabled={isLoading || isPreparingPayment || !canProceed} className="gap-2 w-full sm:w-auto h-9 text-sm">
                  {isPreparingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Thu tiền & Trả phòng
                </Button>
              </>
            ) : (
              <Button onClick={handleConfirm} disabled={isLoading || !canProceed} className="w-full sm:w-auto h-9">
                Xác nhận Check-out
              </Button>
            )}
          </div>
        </div>

        {/* Hidden Damage Report for Printing */}
        {showDamageReport && adjustedDamageItems.length > 0 && (
          <div className="hidden">
            <DamageReportDocument
              ref={reportRef}
              guestName={guestName}
              roomNumber={roomNumber}
              checkoutDate={actualCheckoutDate}
              damageItems={adjustedDamageItems}
              totalCharge={totalDamageCharge}
              adjustmentNote={damageAdjustmentNote}
              hotelInfo={hotelInfo}
            />
          </div>
        )}
      </AlertDialogContent>

      {/* Payment Dialog */}
      {bookingId && tenantId && hotelId && (
        <BookingPaymentDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          booking={{
            id: bookingId,
            guest_name: guestName,
            room_number: roomNumber,
            total_amount: adjustedCostBreakdown.totalAmount,
            amount_paid: adjustedCostBreakdown.amountPaid,
            deposit_amount: adjustedCostBreakdown.depositAmount,
            tenant_id: tenantId,
            hotel_id: hotelId,
          }}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </AlertDialog>
  )
}
