import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  Banknote,
  CreditCard,
  Maximize2,
  CheckCircle,
  Loader2,
  Smartphone,
  Users,
  DoorOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatVNCurrency } from '@/lib/pricing'
import { BankQRCode } from '@/components/payment/BankQRCode'
import { MobilePaymentQRDisplay } from '@/components/payment/MobilePaymentQRDisplay'
import { useBankPaymentSettings } from '@/hooks/useBankPaymentSettings'
import {
  useCreateBookingPayment,
  generatePaymentReference,
  BookingPayment,
} from '@/hooks/useBookingPayments'
import { useGroupBooking, GroupBookingRoom } from '@/hooks/useGroupBooking'
import { cn } from '@/lib/utils'
import { supabase } from '@/integrations/supabase/client'

export interface RoomCostForPayment {
  bookingId: string
  calculatedTotal: number // Grand total including overdue, VAT, fees
}

export interface GroupPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingGroupId: string
  tenantId: string
  hotelId: string
  onPaymentComplete?: () => void
  calculatedRemaining?: number
  calculatedTotal?: number
  roomCostsByBooking?: RoomCostForPayment[]
  /** Optional checkout scope; omitted when paying the whole booking group. */
  bookingIds?: string[]
}

type PaymentMethod = 'cash' | 'bank_transfer'
type Step = 'select' | 'qr' | 'success'

export function GroupPaymentDialog({
  open,
  onOpenChange,
  bookingGroupId,
  tenantId,
  hotelId,
  onPaymentComplete,
  calculatedRemaining,
  calculatedTotal,
  roomCostsByBooking,
  bookingIds,
}: GroupPaymentDialogProps) {
  const { data: groupData, isLoading: isLoadingGroup } = useGroupBooking(bookingGroupId)
  
  const [step, setStep] = useState<Step>('select')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [amount, setAmount] = useState('')
  const [showMobileQR, setShowMobileQR] = useState(false)
  const [createdPayment, setCreatedPayment] = useState<BookingPayment | null>(null)
  const [isSendingNotification, setIsSendingNotification] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const { data: bankSettings } = useBankPaymentSettings(hotelId)
  const createPayment = useCreateBookingPayment()
  const groupRemainingAmount = groupData?.remainingAmount
  const createdPaymentId = createdPayment?.id

  // Reset state when dialog opens
  useEffect(() => {
    if (open && groupRemainingAmount !== undefined) {
      setStep('select')
      setPaymentMethod('cash')
      const initAmount = calculatedRemaining ?? groupRemainingAmount
      setAmount(Math.max(0, initAmount).toString())
      setCreatedPayment(null)
    }
  }, [open, calculatedRemaining, groupRemainingAmount])

  // Realtime subscription for bank transfer auto-confirmation
  useEffect(() => {
    if (step !== 'qr' || !createdPaymentId) return

    const channel = supabase
      .channel(`group-payment-${createdPaymentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'booking_payments',
          filter: `id=eq.${createdPaymentId}`,
        },
        async (payload) => {
          const newData = payload.new as any
          if (newData.payment_status === 'completed') {
            // Webhook already distributed payment via atomic RPC - just update UI
            setStep('success')
            toast.success('Thanh toán đã được xác nhận tự động!')
            setTimeout(() => {
              onOpenChange(false)
              onPaymentComplete?.()
            }, 1500)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [step, createdPaymentId, onOpenChange, onPaymentComplete])

  const requestedBookingIds = bookingIds === undefined
    ? undefined
    : [...new Set(bookingIds)]
  const hasExplicitScope = requestedBookingIds !== undefined
  const scopedBookings = groupData
    ? hasExplicitScope
      ? groupData.bookings.filter((booking) => requestedBookingIds.includes(booking.id))
      : groupData.bookings
    : []
  const scopeIsValid = requestedBookingIds === undefined || (
    requestedBookingIds.length > 0
    && scopedBookings.length === requestedBookingIds.length
  )
  const scopedDatabaseRemaining = scopedBookings.reduce(
    (sum, booking) =>
      sum + Math.max(
        0,
        (booking.total_amount || 0) -
          (booking.amount_paid || 0) -
          (booking.deposit_amount || 0),
      ),
    0,
  )
  const scopedDatabaseTotal = scopedBookings.reduce(
    (sum, booking) => sum + (booking.total_amount || 0),
    0,
  )
  const displayTotal = calculatedTotal ?? scopedDatabaseTotal
  // Never ask the server to settle more than its authoritative balance. The
  // checkout preview can include not-yet-persisted charges, so those values
  // are informational until the checkout RPC stores them.
  const remainingAmount = Math.max(
    0,
    Math.min(calculatedRemaining ?? scopedDatabaseRemaining, scopedDatabaseRemaining),
  )
  const parsedAmount = parseFloat(amount.replace(/[^0-9]/g, '')) || 0
  const isValidAmount = parsedAmount > 0

  const handleAmountChange = (value: string) => {
    const numericValue = value.replace(/[^0-9]/g, '')
    setAmount(numericValue)
  }

  const setQuickAmount = (percentage: number) => {
    const quickAmount = Math.round(remainingAmount * percentage)
    setAmount(quickAmount.toString())
  }

  /**
   * Distribute payment amount across bookings
   * Priority: Checked-out rooms first, then by remaining amount
   * Creates one auditable parent row and settles all scoped bookings atomically.
   */
  const distributePayment = async (
    paymentAmount: number,
    bookings: GroupBookingRoom[],
    paymentMethod: PaymentMethod,
  ) => {
    if (!scopeIsValid || bookings.length === 0) {
      throw new Error('NO_BOOKINGS_IN_PAYMENT_SCOPE')
    }

    const payment = await createPayment.mutateAsync({
      tenant_id: tenantId,
      hotel_id: hotelId,
      booking_id: bookings[0].id,
      amount: paymentAmount,
      payment_method: paymentMethod,
      metadata: {
        is_group_payment: true,
        booking_group_id: bookingGroupId,
        booking_ids: bookings.map((booking) => booking.id),
        group_total_amount: paymentAmount,
      },
    })

    const { error } = await supabase.rpc('settle_booking_payment', {
      p_payment_id: payment.id,
      p_gateway_transaction_id: null,
    })
    if (error) throw error
  }

  const handleCashPayment = async (overrideAmount?: number) => {
    const finalAmount = overrideAmount ?? parsedAmount
    if (finalAmount <= 0 || finalAmount > remainingAmount || !groupData || !scopeIsValid) {
      toast.error('Số tiền không hợp lệ')
      return
    }

    setIsProcessing(true)
    try {
      // Create one parent payment and settle the complete group in a single
      // database transaction. A failure cannot leave only half the rooms paid.
      await distributePayment(finalAmount, scopedBookings, 'cash')

      setStep('success')
      toast.success(`Đã nhận ${formatVNCurrency(finalAmount)} tiền mặt cho ${scopedBookings.length} phòng`)

      setTimeout(() => {
        onOpenChange(false)
        onPaymentComplete?.()
      }, 1500)
    } catch (error) {
      console.error('Group cash payment error:', error)
      toast.error('Không thể xử lý thanh toán')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBankTransfer = async (overrideAmount?: number) => {
    const finalAmount = overrideAmount ?? parsedAmount
    if (finalAmount <= 0 || finalAmount > remainingAmount || !groupData || !scopeIsValid) {
      toast.error('Số tiền không hợp lệ')
      return
    }

    if (!bankSettings) {
      toast.error('Chưa cấu hình tài khoản ngân hàng')
      return
    }

    setIsProcessing(true)
    try {
      const paymentBookings = scopedBookings
      const firstBooking = paymentBookings[0]
      if (!firstBooking) throw new Error('NO_BOOKINGS_IN_PAYMENT_SCOPE')
      const reference = generatePaymentReference(
        paymentBookings.map(b => b.room?.room_number).join('-')
      )

      const payment = await createPayment.mutateAsync({
        tenant_id: tenantId,
        hotel_id: hotelId,
        booking_id: firstBooking.id,
        amount: finalAmount,
        payment_method: 'bank_transfer',
        transaction_reference: reference,
        metadata: {
          is_group_payment: true,
          booking_group_id: bookingGroupId,
          booking_ids: paymentBookings.map(b => b.id),
          guest_name: groupData.guestName,
          room_numbers: paymentBookings.map(b => b.room?.room_number).join(', '),
          room_costs_by_booking: roomCostsByBooking || [],
        },
      })

      setCreatedPayment(payment)
      setStep('qr')
    } catch (error) {
      console.error('Group bank transfer error:', error)
      toast.error('Không thể tạo mã thanh toán')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleManualConfirm = async () => {
    if (!createdPayment || !groupData || !scopeIsValid) return

    setIsProcessing(true)
    try {
      // The RPC claims the pending parent row and distributes the group
      // amount atomically. Repeated clicks are idempotent.
      const firstBooking = scopedBookings[0]
      if (!firstBooking) throw new Error('NO_BOOKINGS_IN_PAYMENT_SCOPE')

      const { error } = await supabase.rpc('confirm_booking_payment_manual', {
        p_payment_id: createdPayment.id,
        p_booking_id: firstBooking.id,
        p_amount: createdPayment.amount,
        // This is a parent payment for several bookings.  The first room's
        // total is not the group's total; settlement validates each locked
        // booking balance from the database instead.
        p_total_amount: null,
      })
      if (error) throw error

      setStep('success')
      toast.success('Đã xác nhận thanh toán nhóm')

      setTimeout(() => {
        onOpenChange(false)
        onPaymentComplete?.()
      }, 1500)
    } catch (error) {
      console.error('Manual confirm error:', error)
      toast.error('Không thể xác nhận thanh toán')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSendQRNotification = async () => {
    if (!createdPayment || !groupData) return

    setIsSendingNotification(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        toast.error('Vui lòng đăng nhập lại')
        return
      }

      const paymentPath = `/payment-qr/${createdPayment.id}`
      const roomNumbers = scopedBookings.map(b => b.room?.room_number).join(', ')

      const { data, error: pushError } = await supabase.functions.invoke('send-push-notification', {
        body: {
          user_id: userData.user.id,
          skip_auth_check: true,
          title: `QR Thanh toán nhóm ${scopedBookings.length} phòng`,
          body: `Phòng: ${roomNumbers} - Số tiền: ${formatVNCurrency(parsedAmount)}`,
          tag: `payment-qr-${createdPayment.id}`,
          action_url: paymentPath,
          notification_type: 'payment_qr',
          data: {
            url: paymentPath,
            type: 'payment_qr',
            paymentId: createdPayment.id,
            roomNumber: roomNumbers,
          },
        },
      })

      if (pushError) throw pushError

      if (data?.sent === 0) {
        toast.warning('Chưa có thiết bị nào đăng ký nhận thông báo')
      } else {
        toast.success(`Đã gửi QR đến ${data?.sent || 1} thiết bị`)
      }
    } catch (error) {
      console.error('Send notification error:', error)
      toast.error('Không thể gửi thông báo')
    } finally {
      setIsSendingNotification(false)
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'checked_in':
        return 'Đang ở'
      case 'checked_out':
        return 'Đã trả'
      case 'confirmed':
        return 'Đã đặt'
      default:
        return status
    }
  }

  const getPaymentPercentage = (booking: GroupBookingRoom) => {
    const costEntry = roomCostsByBooking?.find(c => c.bookingId === booking.id)
    const total = Math.max(booking.total_amount || 0, costEntry?.calculatedTotal || 0)
    const paid = (booking.amount_paid || 0) + (booking.deposit_amount || 0)
    if (total === 0) return 100
    return Math.min(100, Math.round((paid / total) * 100))
  }

  const formatCompactCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}tr`
    }
    if (amount >= 1000) {
      return `${Math.round(amount / 1000)}k`
    }
    return amount.toString()
  }

  if (isLoadingGroup) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thanh toán nhóm</DialogTitle>
            <DialogDescription>Đang tải thông tin...</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!groupData) {
    return null
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              {step === 'select' && 'Thanh toán nhóm'}
              {step === 'qr' && 'Quét mã QR'}
              {step === 'success' && 'Thành công'}
            </DialogTitle>
            <DialogDescription>
              {groupData.guestName} • {scopedBookings.length} phòng thanh toán
            </DialogDescription>
          </DialogHeader>

          {/* Step: Select payment */}
          {step === 'select' && (
            <div className="flex flex-col gap-3 px-4 pb-4 overflow-hidden">
              {/* Compact Room List with Progress Bars */}
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-2">
                  {scopedBookings.map((booking) => {
                    // Use calculated total from roomCostsByBooking if available (accounts for overdue)
                    const costEntry = roomCostsByBooking?.find(c => c.bookingId === booking.id)
                    const displayTotal = costEntry?.calculatedTotal || booking.total_amount || 0
                    const displayPaid = (booking.amount_paid || 0) + (booking.deposit_amount || 0)
                    const percentage = displayTotal > 0 ? Math.min(100, Math.round((displayPaid / displayTotal) * 100)) : 0
                    const remaining = displayTotal - displayPaid
                    const isPaid = remaining <= 0
                    
                    return (
                      <div
                        key={booking.id}
                        className={cn(
                          "border rounded-lg p-2.5 space-y-1.5",
                          isPaid && "bg-green-50 border-green-200 dark:bg-green-950/20"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium text-sm">
                              {booking.room?.room_number}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {booking.room?.room_type}
                            </span>
                          </div>
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded",
                            isPaid ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                          )}>
                            {isPaid ? '✓ Đã TT' : getStatusLabel(booking.status)}
                          </span>
                        </div>
                        
                        {/* Progress bar */}
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={percentage} 
                            className={cn(
                              "h-1.5 flex-1",
                              isPaid && "[&>div]:bg-green-500"
                            )}
                          />
                          <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                            {percentage}%
                          </span>
                        </div>
                        
                        {/* Amount info */}
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {formatCompactCurrency(displayPaid)} / {formatCompactCurrency(displayTotal)}
                          </span>
                          {!isPaid && remaining > 0 && (
                            <span className="text-amber-600 font-medium">
                              Còn {formatCompactCurrency(remaining)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>

              <Separator />

              {/* Totals Summary - Compact - Use calculated values */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tổng tính toán ({scopedBookings.length} phòng)</span>
                    <span className="font-mono">{formatVNCurrency(displayTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Đã thanh toán</span>
                  <span className="font-mono text-green-600">
                    -{formatVNCurrency(displayTotal - remainingAmount)}
                  </span>
                </div>
                <Separator className="my-1.5" />
                <div className="flex justify-between font-medium">
                  <span>CÒN LẠI</span>
                  <span className="font-mono text-primary text-lg">
                    {formatVNCurrency(remainingAmount)}
                  </span>
                </div>
              </div>

              {!scopeIsValid ? (
                <p className="text-sm text-red-600">
                  Không có phòng hợp lệ trong phạm vi thanh toán. Vui lòng đóng và chọn lại phòng.
                </p>
              ) : remainingAmount > 0 ? (
                <>
                  {/* Quick Pay Full Button */}
                  <Button
                    className="w-full h-11"
                    disabled={isProcessing}
                    onClick={() => {
                      setAmount(remainingAmount.toString())
                      if (paymentMethod === 'cash') {
                        handleCashPayment(remainingAmount)
                      } else {
                        handleBankTransfer(remainingAmount)
                      }
                    }}
                  >
                    {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Thanh toán đủ {formatVNCurrency(remainingAmount)}
                  </Button>

                  {/* Or Custom Amount */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">Hoặc nhập số tiền</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={amount ? parseInt(amount).toLocaleString('vi-VN') : ''}
                        onChange={(e) => handleAmountChange(e.target.value)}
                        placeholder="Số tiền"
                        className="flex-1 text-right font-mono h-9"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 px-3"
                        onClick={() => setQuickAmount(0.5)}
                      >
                        50%
                      </Button>
                    </div>
                    {parsedAmount > remainingAmount && (
                      <p className="text-xs text-red-500">Vượt quá số còn lại</p>
                    )}
                  </div>

                  {/* Payment Method */}
                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                    className="grid grid-cols-2 gap-2"
                  >
                    <Label
                      htmlFor="group-cash"
                      className={cn(
                        'flex items-center justify-center gap-2 py-2.5 rounded-lg border cursor-pointer transition-colors',
                        paymentMethod === 'cash'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-muted hover:border-muted-foreground/30'
                      )}
                    >
                      <RadioGroupItem value="cash" id="group-cash" className="sr-only" />
                      <Banknote className="h-4 w-4" />
                      <span className="text-sm font-medium">Tiền mặt</span>
                    </Label>

                    <Label
                      htmlFor="group-bank"
                      className={cn(
                        'flex items-center justify-center gap-2 py-2.5 rounded-lg border cursor-pointer transition-colors',
                        paymentMethod === 'bank_transfer'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-muted hover:border-muted-foreground/30',
                        !bankSettings && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <RadioGroupItem
                        value="bank_transfer"
                        id="group-bank"
                        className="sr-only"
                        disabled={!bankSettings}
                      />
                      <CreditCard className="h-4 w-4" />
                      <span className="text-sm font-medium">Chuyển khoản</span>
                    </Label>
                  </RadioGroup>

                  {/* Custom Amount Action Button */}
                  {parsedAmount > 0 && parsedAmount < remainingAmount && (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={!isValidAmount || isProcessing}
                      onClick={() => paymentMethod === 'cash' ? handleCashPayment() : handleBankTransfer()}
                    >
                      {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {paymentMethod === 'cash' ? 'Xác nhận tiền mặt' : 'Tạo mã QR'}
                      {' '}({formatVNCurrency(parsedAmount)})
                    </Button>
                  )}
                </>
              ) : (
                <div className="py-4 text-center">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
                  <p className="text-green-600 font-medium">
                    Nhóm đã thanh toán đầy đủ
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step: QR Code */}
          {step === 'qr' && bankSettings && createdPayment && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="space-y-3 px-4 pb-4">
                <div className="bg-muted/50 rounded-lg p-2 text-center text-sm">
                  <span className="text-muted-foreground">Phòng: </span>
                  <span className="font-medium">
                    {groupData.bookings.map(b => b.room?.room_number).join(', ')}
                  </span>
                </div>

                <BankQRCode
                  bankCode={bankSettings.bank_code}
                  bankName={bankSettings.bank_name}
                  accountNumber={bankSettings.account_number}
                  accountHolder={bankSettings.account_holder}
                  amount={parsedAmount}
                  paymentContent={createdPayment.transaction_reference || ''}
                />

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setShowMobileQR(true)}
                  >
                    <Maximize2 className="h-4 w-4 mr-1.5" />
                    Toàn màn hình
                  </Button>

                  <Button
                    variant="outline"
                    type="button"
                    onClick={handleSendQRNotification}
                    disabled={isSendingNotification}
                  >
                    {isSendingNotification ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Smartphone className="h-4 w-4 mr-1.5" />
                    )}
                    Gửi QR
                  </Button>
                </div>

                <Button className="w-full" onClick={handleManualConfirm} disabled={isProcessing}>
                  {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Đã nhận được tiền
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Tự động xác nhận khi nhận chuyển khoản
                </p>
              </div>
            </div>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="py-8 px-4 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-7 w-7 text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold">Thanh toán thành công!</p>
                <p className="text-sm text-muted-foreground">
                  {formatVNCurrency(parsedAmount)} cho {scopedBookings.length} phòng
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mobile QR Fullscreen */}
      {bankSettings && createdPayment && (
        <MobilePaymentQRDisplay
          open={showMobileQR}
          onClose={() => setShowMobileQR(false)}
          qrData={{
            bankCode: bankSettings.bank_code,
            accountNumber: bankSettings.account_number,
            accountHolder: bankSettings.account_holder,
            amount: parsedAmount,
            paymentContent: createdPayment.transaction_reference || '',
          }}
          bookingInfo={{
            guestName: groupData.guestName,
            roomNumber: groupData.bookings.map(b => b.room?.room_number).join(', '),
          }}
        />
      )}
    </>
  )
}
