import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { format, addDays, differenceInDays, startOfDay, isBefore, isAfter } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Calendar as CalendarIcon, User, Phone, Mail, Users, Save, X, Loader2, DollarSign, CreditCard, Clock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { cn, formatCurrency } from '@/lib/utils'
import { canRoomCheckIn, isRoomOccupied, isRoomBlockedForMaintenance } from '@/lib/roomStatus'

import { CheckoutSummaryDialog } from '@/components/bookings/CheckoutSummaryDialog'
import { BookingServiceCharges } from '@/components/services/BookingServiceCharges'
import { fetchServiceChargeSummary, type ServiceChargeDetail } from '@/hooks/useBookingServiceCharges'
import { CheckInConfirmDialog } from '@/components/bookings/CheckInConfirmDialog'
import { ExtendBookingDialog } from '@/components/bookings/ExtendBookingDialog'
import { BookingPaymentDialog } from '@/components/bookings/BookingPaymentDialog'
import { 
  calculateBookingCost, 
  calculateEarlyCheckinCharge, 
  calculateLateCheckoutCharge,
  getEarlyCheckinDescription,
  getLateCheckoutDescription,
  DEFAULT_PRICING_RULES,
  BookingCostBreakdown,
  DamageChargeItem,
} from '@/lib/bookingCalculations'
import { triggerRoomCheckoutNotification, triggerRoomCheckinNotification, triggerNewBookingNotification } from '@/hooks/useNotificationTriggers'
import type { RoomBooking } from '@/hooks/useRoomBooking'
import { createInvoiceAfterCheckout } from '@/lib/invoiceHelpers'
import { PrintReceiptDialog } from '@/components/invoices/PrintReceiptDialog'
import { getFriendlyError } from '@/lib/errorMessage'

// Time options for check-in/check-out
const TIME_OPTIONS = [
  '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', 
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', 
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
]

interface RoomBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: string
  roomNumber: string
  hotelId: string
  tenantId: string
  booking?: RoomBooking | null
  defaultRoomPrice?: number
}

export function RoomBookingDialog({
  open,
  onOpenChange,
  roomId,
  roomNumber,
  hotelId,
  tenantId,
  booking,
  defaultRoomPrice = 0,
}: RoomBookingDialogProps) {
  const { t } = useTranslation(['rooms', 'common'])
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  const isEdit = !!booking
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCheckoutSummary, setShowCheckoutSummary] = useState(false)
  const [showCheckinConfirm, setShowCheckinConfirm] = useState(false)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [suggestedEarlyCharge, setSuggestedEarlyCharge] = useState(0)
  const [showPaymentDetails, setShowPaymentDetails] = useState(false)
  const [checkoutDamageItems, setCheckoutDamageItems] = useState<DamageChargeItem[]>([])
  const [checkoutServiceDetails, setCheckoutServiceDetails] = useState<ServiceChargeDetail[]>([])
  const [showPrintReceiptDialog, setShowPrintReceiptDialog] = useState(false)
  const [printReceiptBookingId, setPrintReceiptBookingId] = useState<string | null>(null)
  const [printReceiptSubtotal, setPrintReceiptSubtotal] = useState(0)
  
  // Guest info
  const [guestName, setGuestName] = useState(booking?.guest_name || '')
  const [guestPhone, setGuestPhone] = useState(booking?.guest_phone || '')
  const [guestEmail, setGuestEmail] = useState(booking?.guest_email || '')
  const [guestCount, setGuestCount] = useState(booking?.guest_count || 1)
  
  // Dates and times
  const [checkInDate, setCheckInDate] = useState<Date | undefined>(
    booking?.check_in_date ? new Date(booking.check_in_date) : new Date()
  )
  const [checkOutDate, setCheckOutDate] = useState<Date | undefined>(
    booking?.check_out_date ? new Date(booking.check_out_date) : addDays(new Date(), 1)
  )
  const [checkInTime, setCheckInTime] = useState<string>(booking?.expected_check_in_time?.slice(0, 5) || '14:00')
  const [checkOutTime, setCheckOutTime] = useState<string>(booking?.expected_check_out_time?.slice(0, 5) || '12:00')
  
  const [status, setStatus] = useState(booking?.status || 'confirmed')
  const [notes, setNotes] = useState(booking?.notes || '')
  
  // Financial fields
  const [roomPrice, setRoomPrice] = useState<number>(booking?.room_price || defaultRoomPrice)
  const [extraCharges, setExtraCharges] = useState<number>(booking?.extra_charges || 0)
  const [depositAmount, setDepositAmount] = useState<number>(booking?.deposit_amount || 0)
  const [amountPaid, setAmountPaid] = useState<number>(booking?.amount_paid || 0)
  
  // Surcharges (auto-calculated)
  const [earlyCheckinCharge, setEarlyCheckinCharge] = useState<number>(booking?.early_checkin_charge || 0)
  const [lateCheckoutCharge, setLateCheckoutCharge] = useState<number>(booking?.late_checkout_charge || 0)
  
  // Service charges from consumables
  const [serviceCharges, setServiceCharges] = useState<number>(booking?.service_charges || 0)

  // State for extend booking dialog
  const [showExtendDialog, setShowExtendDialog] = useState(false)
  const [overdueCheckoutDate, setOverdueCheckoutDate] = useState<string | null>(null)
  
  // Flag to track if user manually changed check-in time (prevent auto-overwrite on edit)
  const [userChangedCheckInTime, setUserChangedCheckInTime] = useState(false)
  
  // Tax rates
  const [vatRate, setVatRate] = useState<number>(booking?.vat_rate ?? DEFAULT_PRICING_RULES.vatRate)
  const [serviceFeeRate, setServiceFeeRate] = useState<number>(booking?.service_fee_rate ?? DEFAULT_PRICING_RULES.serviceFeeRate)
  
  // Calculate nights
  const nights = checkInDate && checkOutDate ? Math.max(1, differenceInDays(checkOutDate, checkInDate)) : 1
  
  // Calculate cost breakdown
  // Derive booking type params from booking data
  const bookingType = (booking?.booking_type as 'daily' | 'hourly' | 'monthly') || 'daily'
  const hourlyRate = booking?.hourly_rate || 0
  const monthlyRate = booking?.monthly_rate || 0
  const bookingHours = booking?.booking_hours || 0
  const bookingMonths = booking?.booking_months || 0

  // Calculate damage charges from checkoutDamageItems
  const calculatedDamageCharges = useMemo(() => {
    return checkoutDamageItems.reduce((sum, item) => sum + (item.charge_amount * item.quantity), 0)
  }, [checkoutDamageItems])

  const costBreakdown = useMemo<BookingCostBreakdown>(() => {
    return calculateBookingCost({
      bookingType,
      roomPrice,
      nights,
      earlyCheckinCharge,
      lateCheckoutCharge,
      hourlyRate,
      hours: bookingHours,
      monthlyRate,
      months: bookingMonths,
      serviceCharges,
      extraCharges,
      damageCharges: calculatedDamageCharges,
      damageItems: checkoutDamageItems.length > 0 ? checkoutDamageItems : undefined,
      vatRate,
      serviceFeeRate,
      depositAmount,
      amountPaid,
    })
  }, [bookingType, roomPrice, nights, earlyCheckinCharge, lateCheckoutCharge, hourlyRate, bookingHours, monthlyRate, bookingMonths, serviceCharges, extraCharges, calculatedDamageCharges, checkoutDamageItems, vatRate, serviceFeeRate, depositAmount, amountPaid])

  // Auto-calculate early check-in surcharge when time changes
  // Only auto-calculate for new bookings OR when user explicitly changed the time
  useEffect(() => {
    if (checkInTime && roomPrice && (!isEdit || userChangedCheckInTime)) {
      const charge = calculateEarlyCheckinCharge(checkInTime, roomPrice)
      setEarlyCheckinCharge(charge)
    }
  }, [checkInTime, roomPrice, isEdit, userChangedCheckInTime])

  // Reset form when booking changes
  useEffect(() => {
    if (booking) {
      setGuestName(booking.guest_name || '')
      setGuestPhone(booking.guest_phone || '')
      setGuestEmail(booking.guest_email || '')
      setGuestCount(booking.guest_count || 1)
      setCheckInDate(booking.check_in_date ? new Date(booking.check_in_date) : new Date())
      setCheckOutDate(booking.check_out_date ? new Date(booking.check_out_date) : addDays(new Date(), 1))
      setCheckInTime(booking?.expected_check_in_time?.slice(0, 5) || '14:00')
      setCheckOutTime(booking?.expected_check_out_time?.slice(0, 5) || '12:00')
      setStatus(booking.status || 'confirmed')
      setNotes(booking.notes || '')
      setRoomPrice(booking?.room_price || defaultRoomPrice)
      setExtraCharges(booking?.extra_charges || 0)
      setDepositAmount(booking?.deposit_amount || 0)
      setAmountPaid(booking?.amount_paid || 0)
      setEarlyCheckinCharge(booking?.early_checkin_charge || 0)
      setLateCheckoutCharge(booking?.late_checkout_charge || 0)
      setServiceCharges(booking?.service_charges || 0)
      setVatRate(booking?.vat_rate || DEFAULT_PRICING_RULES.vatRate)
      setServiceFeeRate(booking?.service_fee_rate || DEFAULT_PRICING_RULES.serviceFeeRate)
      setUserChangedCheckInTime(false)
    }
  }, [booking, defaultRoomPrice])
  
  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['room-booking', roomId] })
    queryClient.invalidateQueries({ queryKey: ['room-bookings', roomId] })
    queryClient.invalidateQueries({ queryKey: ['all-bookings'] })
    queryClient.invalidateQueries({ queryKey: ['booking-stats'] })
    queryClient.invalidateQueries({ queryKey: ['today-checkouts'] })
    queryClient.invalidateQueries({ queryKey: ['today-checkins'] })
    queryClient.invalidateQueries({ queryKey: ['rooms'] })
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!guestName.trim()) {
      toast({
        variant: 'destructive',
        title: t('booking.validation.guestNameRequired'),
      })
      return
    }
    
    if (!checkInDate || !checkOutDate) {
      toast({
        variant: 'destructive',
        title: t('booking.validation.datesRequired'),
      })
      return
    }
    
    if (checkOutDate <= checkInDate) {
      toast({
        variant: 'destructive',
        title: t('booking.validation.invalidDates'),
      })
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const bookingData: Record<string, any> = {
        room_id: roomId,
        hotel_id: hotelId,
        tenant_id: tenantId,
        guest_name: guestName.trim(),
        guest_phone: guestPhone.trim() || null,
        guest_email: guestEmail.trim() || null,
        guest_count: guestCount,
        check_in_date: format(checkInDate, 'yyyy-MM-dd'),
        check_out_date: format(checkOutDate, 'yyyy-MM-dd'),
        expected_check_in_time: checkInTime,
        expected_check_out_time: checkOutTime,
        status,
        notes: notes.trim() || null,
        actual_check_in: status === 'checked_in' ? new Date().toISOString() : null,
        // Financial fields
        room_price: roomPrice,
        extra_charges: extraCharges,
        early_checkin_charge: earlyCheckinCharge,
        late_checkout_charge: lateCheckoutCharge,
        service_charges: serviceCharges,
        subtotal: costBreakdown.subtotal,
        vat_rate: vatRate,
        vat_amount: costBreakdown.vatAmount,
        service_fee_rate: serviceFeeRate,
        service_fee_amount: costBreakdown.serviceFeeAmount,
        total_amount: costBreakdown.totalAmount,
        deposit_amount: depositAmount,
        amount_paid: amountPaid,
      }

      // Keep reception-created bookings connected to the CRM guest record.
      // The booking wizard already does this, but this room-level dialog used
      // to write an unlinked booking directly.
      let guestId = (booking as any)?.guest_id || null
      const normalizedPhone = guestPhone.trim() || null
      const normalizedEmail = guestEmail.trim().toLowerCase() || null
      if (!guestId && (normalizedPhone || normalizedEmail)) {
        if (normalizedPhone) {
          const { data: phoneGuest, error: phoneLookupError } = await supabase
            .from('guests')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('phone', normalizedPhone)
            .maybeSingle()
          if (phoneLookupError) throw phoneLookupError
          guestId = phoneGuest?.id || null
        }

        if (!guestId && normalizedEmail) {
          const { data: emailGuest, error: emailLookupError } = await supabase
            .from('guests')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('email', normalizedEmail)
            .maybeSingle()
          if (emailLookupError) throw emailLookupError
          guestId = emailGuest?.id || null
        }

        if (!guestId) {
          const { data: createdGuest, error: guestInsertError } = await supabase
            .from('guests')
            .insert({
              tenant_id: tenantId,
              full_name: guestName.trim(),
              phone: normalizedPhone,
              email: normalizedEmail,
              vip_level: 'normal',
            } as any)
            .select('id')
            .single()
          if (guestInsertError) throw guestInsertError
          guestId = createdGuest?.id || null
        }
      }
      if (guestId) bookingData.guest_id = guestId

      // Preserve booking type fields on edit to prevent resetting hourly/monthly data
      if (isEdit && booking) {
        bookingData.booking_type = booking.booking_type || 'daily'
        bookingData.hourly_rate = booking.hourly_rate
        bookingData.monthly_rate = booking.monthly_rate
        bookingData.booking_hours = booking.booking_hours
        bookingData.booking_months = booking.booking_months
      }
      
      if (isEdit && booking) {
        const { error } = await supabase
          .from('room_bookings')
          .update(bookingData)
          .eq('id', booking.id)
          
        if (error) throw error
        
        toast({
          title: t('booking.updateSuccess'),
        })
      } else {
        const { data: newBooking, error } = await supabase
          .from('room_bookings')
          .insert(bookingData as any)
          .select('id')
          .single()
          
        if (error) throw error
        
        // Trigger new booking notification
        if (tenantId && hotelId && newBooking) {
          triggerNewBookingNotification({
            tenantId,
            hotelId,
            roomNumber,
            guestName: guestName.trim(),
            checkInDate: format(checkInDate, 'dd/MM/yyyy'),
            checkOutDate: format(checkOutDate, 'dd/MM/yyyy'),
            bookingId: newBooking.id,
          }).catch(err => console.error('Failed to send booking notification:', err))
        }
        
        toast({
          title: t('booking.createSuccess'),
        })
      }
      
      invalidateQueries()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error saving booking:', error)
      toast({
        variant: 'destructive',
        title: t('booking.saveError'),
        description: getFriendlyError(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }
  
  const handleCheckInClick = async () => {
    if (!booking) return

    const now = new Date()
    const today = startOfDay(now)
    const bookingCheckInDate = startOfDay(new Date(booking.check_in_date))

    // Block check-in if today is before check_in_date
    if (isBefore(today, bookingCheckInDate)) {
      toast({
        variant: 'destructive',
        title: 'Chưa đến ngày nhận phòng',
        description: `Lịch nhận phòng: ${format(bookingCheckInDate, 'dd/MM/yyyy', { locale: vi })}. Vui lòng thay đổi lịch đặt nếu muốn nhận sớm.`,
      })
      return
    }

    // Validate room status before check-in
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('status')
      .eq('id', roomId)
      .single()

    if (roomError) {
      toast({
        variant: 'destructive',
        title: 'Lỗi kiểm tra phòng',
        description: roomError.message,
      })
      return
    }

    // Block if room is occupied bởi booking khác
    if (isRoomOccupied(roomData.status)) {
      const { data: currentBooking } = await supabase
        .from('room_bookings')
        .select('id, guest_name, check_out_date')
        .eq('room_id', roomId)
        .eq('status', 'checked_in')
        .neq('id', booking.id)
        .limit(1)
        .single()

      if (currentBooking) {
        toast({
          variant: 'destructive',
          title: 'Phòng đang có khách',
          description: `Khách "${currentBooking.guest_name}" chưa checkout (dự kiến: ${format(new Date(currentBooking.check_out_date), 'dd/MM/yyyy')}). Vui lòng checkout khách hiện tại trước.`,
        })
        return
      }
    }

    // Block bảo trì
    if (isRoomBlockedForMaintenance(roomData.status)) {
      toast({
        variant: 'destructive',
        title: 'Phòng không khả dụng',
        description: 'Phòng đang bảo trì/ngừng hoạt động. Không thể check-in.',
      })
      return
    }

    if (!canRoomCheckIn(roomData.status) && !isRoomOccupied(roomData.status)) {
      toast({
        variant: 'destructive',
        title: 'Phòng chưa sẵn sàng',
        description: 'Phòng đang ở trạng thái "Trống – chưa dọn". Vui lòng dọn phòng trước khi check-in.',
      })
      return
    }

    
    // Calculate early check-in surcharge based on current time
    const actualTime = format(now, 'HH:mm')
    const hours = parseInt(actualTime.split(':')[0])
    
    // Calculate surcharge for early check-in (before 14:00)
    let suggestedCharge = 0
    if (hours < 14) {
      suggestedCharge = calculateEarlyCheckinCharge(actualTime, roomPrice)
    }
    setSuggestedEarlyCharge(suggestedCharge)
    // ALWAYS show confirmation dialog
    setShowCheckinConfirm(true)
  }

  const performCheckIn = async (finalEarlyCharge: number, adjustmentNote?: string) => {
    if (!booking) return
    
    setIsSubmitting(true)
    setShowCheckinConfirm(false)
    
    try {
      // Use atomic RPC for check-in (updates booking + room in single transaction)
      const { data, error } = await supabase.rpc('perform_checkin', {
        p_booking_id: booking.id,
        p_room_id: roomId,
        p_early_checkin_charge: finalEarlyCharge,
      })

      if (error) {
        // Handle specific RPC errors
        if (error.message?.includes('ROOM_OCCUPIED')) {
          const guestName = error.message.split(':')[1] || 'unknown'
          throw new Error(`Phòng đang có khách "${guestName}". Vui lòng checkout trước.`)
        }
        if (error.message?.includes('INVALID_ROOM_STATUS')) {
          const status = error.message.split(':')[1] || 'unknown'
          throw new Error(`Phòng đang ở trạng thái "${status}", không thể check-in.`)
        }
        throw error
      }
      
      // Update adjustment note separately if provided
      if (adjustmentNote) {
        const existingNotes = notes || ''
        const updateNotes = existingNotes 
          ? `${existingNotes}\n[Điều chỉnh phụ thu check-in sớm: ${adjustmentNote}]`
          : `[Điều chỉnh phụ thu check-in sớm: ${adjustmentNote}]`
        await supabase
          .from('room_bookings')
          .update({ notes: updateNotes })
          .eq('id', booking.id)
      }
      
      // Send check-in notification
      if (tenantId && hotelId) {
        triggerRoomCheckinNotification({
          tenantId,
          hotelId,
          roomId,
          roomNumber,
          guestName: guestName || undefined,
        }).catch(err => console.error('Failed to send check-in notification:', err))
      }
      
      toast({
        title: t('booking.checkInSuccess'),
        description: finalEarlyCharge > 0 
          ? `Phụ thu check-in sớm: ${formatCurrency(finalEarlyCharge)}`
          : undefined,
      })
      
      invalidateQueries()
      onOpenChange(false)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('booking.checkInError'),
        description: getFriendlyError(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }
  
  const handleCheckOutClick = async () => {
    if (!booking) return

    const now = new Date()
    const today = startOfDay(now)
    const bookingCheckOutDate = startOfDay(new Date(booking.check_out_date))

    // Block checkout if today is after check_out_date (overdue)
    if (isAfter(today, bookingCheckOutDate)) {
      setShowExtendDialog(true)
      return
    }

    // Calculate late checkout charge based on current time
    const actualTime = format(now, 'HH:mm')
    const calculatedLateCharge = calculateLateCheckoutCharge(actualTime, roomPrice)
    setLateCheckoutCharge(calculatedLateCharge)
    
    // Fetch latest service charge summary (services + minibar)
    try {
      const summary = await fetchServiceChargeSummary(booking.id, tenantId, { includeAllBilled: true })
      setServiceCharges(summary.grandTotal)
      setCheckoutServiceDetails(summary.details)
    } catch (error) {
      console.error('Failed to fetch service charges:', error)
      setCheckoutServiceDetails([])
    }

    // Fetch latest room check for damage info
    try {
      const { data: latestCheck } = await supabase
        .from('room_checks')
        .select('items_lost, items_damaged, items_consumed')
        .eq('room_id', roomId)
        .in('check_type', ['checkout', 'daily'])
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Convert to DamageChargeItem[]
      const damageItems: DamageChargeItem[] = [
        ...((latestCheck?.items_lost as any[]) || []).map(item => ({
          item_id: item.item_id,
          item_name: item.item_name,
          item_type: 'lost' as const,
          quantity: item.quantity,
          charge_amount: item.estimated_value || 0,
        })),
        ...((latestCheck?.items_damaged as any[]) || []).map(item => ({
          item_id: item.item_id,
          item_name: item.item_name,
          item_type: 'damaged' as const,
          quantity: item.quantity,
          charge_amount: item.damage_cost || 0,
          damage_type: item.damage_type,
        })),
        // items_consumed excluded — already tracked via chargeable_consumptions
      ]
      
      setCheckoutDamageItems(damageItems)
    } catch (error) {
      console.error('Failed to fetch damage items:', error)
      setCheckoutDamageItems([])
    }
    
    // Show checkout summary dialog
    setShowCheckoutSummary(true)
  }
  
  const performCheckOut = async (
    adjustedLateCharge: number, 
    adjustmentNote?: string,
    damageCharges?: number,
    damageAdjustmentNote?: string,
    adjustedDamageItems?: DamageChargeItem[]
  ) => {
    if (!booking) return
    
    setIsSubmitting(true)
    setShowCheckoutSummary(false)
    
    try {
      // Calculate effective nights for overdue bookings
      const effectiveNights = overdueCheckoutDate 
        ? Math.max(1, differenceInDays(new Date(overdueCheckoutDate), new Date(booking.check_in_date)))
        : nights

      // Recalculate cost breakdown with adjusted late charge and damage
      const adjustedCostBreakdown = calculateBookingCost({
        bookingType,
        roomPrice,
        nights: effectiveNights,
        earlyCheckinCharge,
        lateCheckoutCharge: adjustedLateCharge,
        hourlyRate,
        hours: bookingHours,
        hourlyOvertimeCharge: bookingType === 'hourly' ? adjustedLateCharge : 0,
        monthlyRate,
        months: bookingMonths,
        serviceCharges,
        extraCharges,
        damageCharges: damageCharges || 0,
        damageItems: adjustedDamageItems,
        vatRate,
        serviceFeeRate,
        depositAmount,
        amountPaid,
      })

      // Use RPC for atomic checkout operation with damage params
      // Pass current amount_paid so RPC can calculate correct payment_status
      const { data, error } = await supabase.rpc('perform_checkout', {
        p_booking_id: booking.id,
        p_room_id: roomId,
        p_late_checkout_charge: adjustedLateCharge,
        p_service_charges: serviceCharges,
        p_subtotal: adjustedCostBreakdown.subtotal,
        // VAT/phí dịch vụ/tổng tiền: server tự tính lại từ rate gốc của booking
        p_damage_charges: damageCharges || 0,
        p_damage_notes: damageAdjustmentNote || null,
        p_damage_items: adjustedDamageItems ? JSON.stringify(adjustedDamageItems) : '[]',
        p_check_out_date: overdueCheckoutDate,
        p_new_amount_paid: null,
      })
      
      if (error) throw error

      // Fire-and-forget: create invoice
      createInvoiceAfterCheckout({ bookingId: booking.id, tenantId, hotelId, userId: null }).catch(err => console.error('Failed to create invoice', err))
      setPrintReceiptBookingId(booking.id)
      setPrintReceiptSubtotal(adjustedCostBreakdown.subtotal)
      setShowPrintReceiptDialog(true)


      // Update notes if there was an adjustment
      const allNotes: string[] = []
      if (adjustmentNote) allNotes.push(`[Điều chỉnh phụ thu checkout: ${adjustmentNote}]`)
      if (damageAdjustmentNote) allNotes.push(`[Điều chỉnh phí đền bù: ${damageAdjustmentNote}]`)
      
      if (allNotes.length > 0) {
        const updateNotes = notes 
          ? `${notes}\n${allNotes.join('\n')}` 
          : allNotes.join('\n')
        await supabase
          .from('room_bookings')
          .update({ notes: updateNotes })
          .eq('id', booking.id)
      }
      
      // Send checkout notification to staff
      if (tenantId && hotelId) {
        triggerRoomCheckoutNotification({
          tenantId,
          hotelId,
          roomId,
          roomNumber,
        }).catch(err => console.error('Failed to send checkout notification:', err))
      }
      
      toast({
        title: t('booking.checkOutSuccess'),
      })
      
      invalidateQueries()
      onOpenChange(false)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('booking.checkOutError'),
        description: getFriendlyError(error),
      })
    } finally {
      setIsSubmitting(false)
      setCheckoutDamageItems([])
      setOverdueCheckoutDate(null)
    }
  }


  const handlePayAndCheckout = async (
    adjustedLateCharge: number, 
    adjustmentNote?: string,
    damageCharges?: number,
    damageAdjustmentNote?: string,
    adjustedDamageItems?: DamageChargeItem[]
  ) => {
    if (!booking) return
    
    setIsSubmitting(true)
    setShowCheckoutSummary(false)
    
    try {
      // Calculate effective nights for overdue bookings
      const effectiveNights = overdueCheckoutDate 
        ? Math.max(1, differenceInDays(new Date(overdueCheckoutDate), new Date(booking.check_in_date)))
        : nights

      // Recalculate cost breakdown with adjusted late charge and damage
      const adjustedCostBreakdown = calculateBookingCost({
        bookingType,
        roomPrice,
        nights: effectiveNights,
        earlyCheckinCharge,
        lateCheckoutCharge: adjustedLateCharge,
        hourlyRate,
        hours: bookingHours,
        hourlyOvertimeCharge: bookingType === 'hourly' ? adjustedLateCharge : 0,
        monthlyRate,
        months: bookingMonths,
        serviceCharges,
        extraCharges,
        damageCharges: damageCharges || 0,
        damageItems: adjustedDamageItems,
        vatRate,
        serviceFeeRate,
        depositAmount,
        amountPaid,
      })

      // BookingPaymentDialog already updated amount_paid via update_booking_amount_paid RPC (ADD operation)
      // Pass null to preserve the DB value and avoid overwriting partial payments
      const { data, error } = await supabase.rpc('perform_checkout', {
        p_booking_id: booking.id,
        p_room_id: roomId,
        p_late_checkout_charge: adjustedLateCharge,
        p_service_charges: serviceCharges,
        p_subtotal: adjustedCostBreakdown.subtotal,
        // VAT/phí dịch vụ/tổng tiền: server tự tính lại
        p_damage_charges: damageCharges || 0,
        p_damage_notes: damageAdjustmentNote || null,
        p_damage_items: adjustedDamageItems ? JSON.stringify(adjustedDamageItems) : '[]',
        p_new_amount_paid: null,
        p_check_out_date: overdueCheckoutDate,
      })
      
      if (error) throw error

      // Fire-and-forget: create invoice
      createInvoiceAfterCheckout({ bookingId: booking.id, tenantId, hotelId, userId: null }).catch(err => console.error('Failed to create invoice', err))
      setPrintReceiptBookingId(booking.id)
      setPrintReceiptSubtotal(adjustedCostBreakdown.subtotal)
      setShowPrintReceiptDialog(true)


      // Update notes if there was an adjustment
      const allNotes: string[] = []
      if (adjustmentNote) allNotes.push(`[Điều chỉnh phụ thu checkout: ${adjustmentNote}]`)
      if (damageAdjustmentNote) allNotes.push(`[Điều chỉnh phí đền bù: ${damageAdjustmentNote}]`)
      
      if (allNotes.length > 0) {
        const updateNotes = notes 
          ? `${notes}\n${allNotes.join('\n')}` 
          : allNotes.join('\n')
        await supabase
          .from('room_bookings')
          .update({ notes: updateNotes })
          .eq('id', booking.id)
      }
      
      // Send checkout notification to staff
      if (tenantId && hotelId) {
        triggerRoomCheckoutNotification({
          tenantId,
          hotelId,
          roomId,
          roomNumber,
        }).catch(err => console.error('Failed to send checkout notification:', err))
      }
      
      toast({
        title: 'Đã thanh toán và check-out thành công',
      })
      
      invalidateQueries()
      onOpenChange(false)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Lỗi',
        description: getFriendlyError(error),
      })
    } finally {
      setIsSubmitting(false)
      setCheckoutDamageItems([])
      setOverdueCheckoutDate(null)
    }
  }

  // Get surcharge descriptions
  const earlyCheckinDesc = getEarlyCheckinDescription(checkInTime)
  // Only show late checkout description during actual checkout process, not in edit form
  const lateCheckoutDesc = !isEdit ? getLateCheckoutDescription(checkOutTime) : null
  
  // Determine which status options are allowed to prevent bypassing check-in/checkout logic
  const getAllowedStatusOptions = () => {
    if (!isEdit || !booking) return ['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']
    const currentStatus = booking.status
    switch (currentStatus) {
      case 'confirmed':
        return ['confirmed', 'cancelled', 'no_show'] // Must use Check-in button for checked_in
      case 'checked_in':
        return ['checked_in'] // Must use Checkout button, no manual status change
      case 'checked_out':
        return ['checked_out'] // Final state
      case 'cancelled':
        return ['cancelled', 'confirmed'] // Allow reactivate
      default:
        return ['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']
    }
  }
  const allowedStatuses = getAllowedStatusOptions()
  
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t('booking.editTitle') : t('booking.addTitle')} - {t('detail.title', { number: roomNumber })}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Guest Name */}
            <div className="space-y-2">
              <Label htmlFor="guestName" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {t('booking.guestName')} *
              </Label>
              <Input
                id="guestName"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder={t('booking.guestNamePlaceholder')}
                required
              />
            </div>
            
            {/* Contact Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="guestPhone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {t('booking.phone')}
                </Label>
                <Input
                  id="guestPhone"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="0909..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guestEmail" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {t('booking.email')}
                </Label>
                <Input
                  id="guestEmail"
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="email@..."
                />
              </div>
            </div>
            
            {/* Guest Count */}
            <div className="space-y-2">
              <Label htmlFor="guestCount" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {t('booking.guestCount')}
              </Label>
              <Input
                id="guestCount"
                type="number"
                min={1}
                max={10}
                value={guestCount}
                onChange={(e) => setGuestCount(parseInt(e.target.value) || 1)}
              />
            </div>
            
            {/* Check-in/Check-out Section */}
            <div className="border rounded-lg p-3 space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Thời gian lưu trú
              </h4>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Check-in */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Check-in *</Label>
                  <div className="flex gap-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            "flex-1 justify-start text-left font-normal h-8",
                            !checkInDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {checkInDate ? format(checkInDate, 'dd/MM', { locale: vi }) : "Ngày"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={checkInDate}
                          onSelect={setCheckInDate}
                          locale={vi}
                        />
                      </PopoverContent>
                    </Popover>
                    <Select value={checkInTime} onValueChange={(val) => { setCheckInTime(val); if (isEdit) setUserChangedCheckInTime(true); }}>
                      <SelectTrigger className="w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map((time) => (
                          <SelectItem key={time} value={time}>{time}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {earlyCheckinDesc && (
                    <p className="text-xs text-amber-600">{earlyCheckinDesc}</p>
                  )}
                </div>
                
                {/* Check-out */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Check-out *</Label>
                  <div className="flex gap-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            "flex-1 justify-start text-left font-normal h-8",
                            !checkOutDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {checkOutDate ? format(checkOutDate, 'dd/MM', { locale: vi }) : "Ngày"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={checkOutDate}
                          onSelect={setCheckOutDate}
                          disabled={(date) => checkInDate ? date <= checkInDate : false}
                          locale={vi}
                        />
                      </PopoverContent>
                    </Popover>
                    <Select value={checkOutTime} onValueChange={setCheckOutTime}>
                      <SelectTrigger className="w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map((time) => (
                          <SelectItem key={time} value={time}>{time}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {lateCheckoutDesc && (
                    <p className="text-xs text-amber-600">{lateCheckoutDesc}</p>
                  )}
                </div>
              </div>
              
              {/* Actual check-in/out times */}
              {isEdit && booking && (
                <div className="text-xs text-muted-foreground pt-2 border-t space-y-1">
                  <div className="flex justify-between">
                    <span>Thực tế check-in:</span>
                    <span className={booking.actual_check_in ? 'text-green-600 font-medium' : ''}>
                      {booking.actual_check_in 
                        ? format(new Date(booking.actual_check_in), 'dd/MM/yyyy HH:mm', { locale: vi })
                        : '--'
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Thực tế check-out:</span>
                    <span className={booking?.actual_check_out ? 'text-green-600 font-medium' : ''}>
                      {booking?.actual_check_out 
                        ? format(new Date(booking.actual_check_out), 'dd/MM/yyyy HH:mm', { locale: vi })
                        : '--'
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Service Charges - only for existing bookings */}
            {isEdit && booking && (
              <BookingServiceCharges
                bookingId={booking.id}
                readOnly={booking.status === 'checked_out' || booking.status === 'cancelled'}
                onTotalChange={(total) => setServiceCharges(total)}
              />
            )}

            {/* Financial Section */}
            <div className="border rounded-lg p-3 space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Thông tin thanh toán
              </h4>
              
              {/* Room Price & Deposit */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="roomPrice" className="text-xs text-muted-foreground">Giá phòng/đêm</Label>
                  <Input
                    id="roomPrice"
                    type="text"
                    inputMode="numeric"
                    className="h-8"
                    value={roomPrice > 0 ? roomPrice.toString() : ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '')
                      setRoomPrice(parseInt(value) || 0)
                    }}
                    placeholder="0"
                  />
                  {roomPrice > 0 && <span className="text-xs text-muted-foreground">{formatCurrency(roomPrice)}</span>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="depositAmount" className="text-xs text-muted-foreground">Tiền đặt cọc</Label>
                  <Input
                    id="depositAmount"
                    type="text"
                    inputMode="numeric"
                    className="h-8"
                    value={depositAmount > 0 ? depositAmount.toString() : ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '')
                      setDepositAmount(parseInt(value) || 0)
                    }}
                    placeholder="0"
                  />
                  {depositAmount > 0 && <span className="text-xs text-muted-foreground">{formatCurrency(depositAmount)}</span>}
                </div>
              </div>
              
              {/* Cost Summary - Always visible */}
              <div className="space-y-2 pt-2 border-t text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tiền phòng ({nights} đêm)</span>
                  <span>{formatCurrency(costBreakdown.roomTotal)}</span>
                </div>
                
                {/* Collapsible Details */}
                <Collapsible open={showPaymentDetails} onOpenChange={setShowPaymentDetails}>
                  <CollapsibleContent className="space-y-2">
                    {/* Surcharges */}
                    {costBreakdown.earlyCheckinCharge > 0 && (
                      <div className="flex justify-between text-amber-600">
                        <span>+ Phụ thu check-in sớm</span>
                        <span>{formatCurrency(costBreakdown.earlyCheckinCharge)}</span>
                      </div>
                    )}
                    {costBreakdown.lateCheckoutCharge > 0 && (
                      <div className="flex justify-between text-amber-600">
                        <span>+ Phụ thu check-out trễ</span>
                        <span>{formatCurrency(costBreakdown.lateCheckoutCharge)}</span>
                      </div>
                    )}
                    
                    {/* Service charges */}
                    {costBreakdown.serviceCharges > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">+ Dịch vụ sử dụng</span>
                        <span>{formatCurrency(costBreakdown.serviceCharges)}</span>
                      </div>
                    )}
                    
                    {/* Extra charges */}
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">+ Chi phí khác</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        className="h-7 w-28 text-right"
                        value={extraCharges > 0 ? extraCharges.toString() : ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '')
                          setExtraCharges(parseInt(value) || 0)
                        }}
                        placeholder="0"
                      />
                    </div>
                    
                    <Separator />
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatCurrency(costBreakdown.subtotal)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">VAT ({vatRate}%)</span>
                      <span>{formatCurrency(costBreakdown.vatAmount)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Phí dịch vụ ({serviceFeeRate}%)</span>
                      <span>{formatCurrency(costBreakdown.serviceFeeAmount)}</span>
                    </div>
                  </CollapsibleContent>
                  
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="w-full h-6 text-xs text-muted-foreground">
                      {showPaymentDetails ? (
                        <>Thu gọn <ChevronUp className="h-3 w-3 ml-1" /></>
                      ) : (
                        <>Xem chi tiết <ChevronDown className="h-3 w-3 ml-1" /></>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>
                
                <Separator />
                
                <div className="flex justify-between font-bold">
                  <span>TỔNG CỘNG</span>
                  <span>{formatCurrency(costBreakdown.totalAmount)}</span>
                </div>
                
                {depositAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Đã đặt cọc</span>
                    <span>-{formatCurrency(depositAmount)}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Đã thanh toán</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="h-7 w-28 text-right"
                    value={amountPaid > 0 ? amountPaid.toString() : ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '')
                      setAmountPaid(parseInt(value) || 0)
                    }}
                    placeholder="0"
                  />
                </div>
                
                <Separator />
                
                <div className="flex justify-between">
                  <span className="font-medium">CÒN LẠI</span>
                  <span className={cn(
                    "font-bold",
                    costBreakdown.remainingAmount > 0 ? "text-red-600" : "text-green-600"
                  )}>
                    {formatCurrency(costBreakdown.remainingAmount)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center pt-1">
                  <span className="text-muted-foreground text-xs">Trạng thái</span>
                  <span className={cn(
                    "text-xs font-medium",
                    costBreakdown.paymentStatus === 'paid' && "text-green-600",
                    costBreakdown.paymentStatus === 'partial' && "text-amber-600",
                    costBreakdown.paymentStatus === 'pending' && "text-red-600"
                  )}>
                    {costBreakdown.paymentStatus === 'paid' && 'Đã thanh toán đủ'}
                    {costBreakdown.paymentStatus === 'partial' && 'Thanh toán một phần'}
                    {costBreakdown.paymentStatus === 'pending' && 'Chưa thanh toán'}
                  </span>
                </div>
              </div>

              {/* Quick Payment Button */}
              {isEdit && costBreakdown.paymentStatus !== 'paid' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full border-green-500 text-green-600 hover:bg-green-50"
                  onClick={() => setShowPaymentDialog(true)}
                  disabled={isSubmitting}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Nhận thanh toán ({formatCurrency(costBreakdown.remainingAmount)})
                </Button>
              )}
            </div>
            
            {/* Status */}
            <div className="space-y-2">
              <Label>{t('booking.status')}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedStatuses.includes('confirmed') && <SelectItem value="confirmed">{t('booking.statusConfirmed')}</SelectItem>}
                  {allowedStatuses.includes('checked_in') && <SelectItem value="checked_in">{t('booking.statusCheckedIn')}</SelectItem>}
                  {allowedStatuses.includes('checked_out') && <SelectItem value="checked_out">{t('booking.statusCheckedOut')}</SelectItem>}
                  {allowedStatuses.includes('cancelled') && <SelectItem value="cancelled">{t('booking.statusCancelled')}</SelectItem>}
                  {allowedStatuses.includes('no_show') && <SelectItem value="no_show">{t('booking.statusNoShow')}</SelectItem>}
                </SelectContent>
              </Select>
              {isEdit && booking?.status === 'checked_in' && (
                <p className="text-xs text-muted-foreground">Sử dụng nút "Trả phòng" bên dưới để checkout</p>
              )}
            </div>
            
            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">{t('booking.notes')}</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('booking.notesPlaceholder')}
                rows={2}
              />
            </div>
            
            {/* Quick Actions for existing booking */}
            {isEdit && booking && (
              <div className="flex gap-2 pt-2 border-t">
                {booking.status === 'confirmed' && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={handleCheckInClick}
                    disabled={isSubmitting}
                  >
                    {t('booking.doCheckIn')}
                  </Button>
                )}
                {booking.status === 'checked_in' && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-red-500 text-red-600 hover:bg-red-50"
                    onClick={handleCheckOutClick}
                    disabled={isSubmitting}
                  >
                    Trả phòng (Check-out)
                  </Button>
                )}
              </div>
            )}
            
            {/* Submit Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                <X className="h-4 w-4 mr-2" />
                {t('common:cancel')}
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isEdit ? t('common:save') : t('booking.addGuest')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Check-in Confirmation Dialog */}
      <CheckInConfirmDialog
        open={showCheckinConfirm}
        onOpenChange={setShowCheckinConfirm}
        guestName={guestName}
        guestPhone={guestPhone || undefined}
        roomNumber={roomNumber}
        actualCheckInTime={format(new Date(), 'HH:mm')}
        roomPrice={roomPrice}
        suggestedCharge={suggestedEarlyCharge}
        bookingType={(booking?.booking_type as 'daily' | 'hourly' | 'monthly') || 'daily'}
        bookingHours={booking?.booking_hours || undefined}
        bookingMonths={booking?.booking_months || undefined}
        checkInDate={checkInDate}
        checkOutDate={checkOutDate}
        totalNights={nights}
        totalAmount={costBreakdown.totalAmount}
        depositAmount={depositAmount}
        bookingSource={booking?.booking_source}
        onConfirm={performCheckIn}
        isLoading={isSubmitting}
      />

      {/* Checkout Summary Dialog */}
      <CheckoutSummaryDialog
        open={showCheckoutSummary}
        onOpenChange={setShowCheckoutSummary}
        guestName={guestName}
        roomNumber={roomNumber}
        actualCheckoutTime={format(new Date(), 'HH:mm')}
        actualCheckoutDate={new Date()}
        scheduledCheckoutDate={booking?.check_out_date ? new Date(booking.check_out_date) : new Date()}
        costBreakdown={costBreakdown}
        damageItems={checkoutDamageItems}
        serviceChargeDetails={checkoutServiceDetails}
        onConfirmCheckout={performCheckOut}
        onPayAndCheckout={handlePayAndCheckout}
        isLoading={isSubmitting}
        bookingId={booking?.id}
        roomId={roomId}
        hotelId={hotelId}
        tenantId={tenantId}
      />

      {/* Extend Booking Dialog - for overdue checkout */}
      {booking && (
        <ExtendBookingDialog
          open={showExtendDialog}
          onOpenChange={setShowExtendDialog}
          booking={{
            id: booking.id,
            guest_name: booking.guest_name,
            room_id: roomId,
            check_in_date: booking.check_in_date,
            check_out_date: booking.check_out_date,
            room_price: roomPrice,
            room: { room_number: roomNumber },
          }}
          onSuccess={() => {
            invalidateQueries()
          }}
          onCheckoutNow={async () => {
            setShowExtendDialog(false)
            if (!booking) return
            
            try {
              const now = new Date()
              const todayStr = format(now, 'yyyy-MM-dd')
              
              // Save overdue checkout date for RPC
              setOverdueCheckoutDate(todayStr)
              
              // Recalculate with updated checkout date
              const checkIn = new Date(booking.check_in_date)
              const checkOut = new Date(todayStr)
              const updatedNights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)))
              
              // Calculate late checkout charge
              const actualTime = format(now, 'HH:mm')
              const calculatedLateCharge = calculateLateCheckoutCharge(actualTime, roomPrice)
              setLateCheckoutCharge(calculatedLateCharge)
              
              // Update local checkout date for cost calculation
              setCheckOutDate(checkOut)
              
              // Fetch service charges summary
              try {
                const summary = await fetchServiceChargeSummary(booking.id, tenantId, { includeAllBilled: true })
                setServiceCharges(summary.grandTotal)
                setCheckoutServiceDetails(summary.details)
              } catch (err) {
                console.error('Failed to fetch service charges:', err)
                setCheckoutServiceDetails([])
              }
              
              // Fetch damage items
              const { data: latestCheck } = await supabase
                .from('room_checks')
                .select('items_lost, items_damaged, items_consumed')
                .eq('room_id', roomId)
                .in('check_type', ['checkout', 'daily'])
                .order('checked_at', { ascending: false })
                .limit(1)
                .maybeSingle()
              
              const damageItems: DamageChargeItem[] = [
                ...((latestCheck?.items_lost as any[]) || []).map(item => ({
                  item_id: item.item_id, item_name: item.item_name, item_type: 'lost' as const,
                  quantity: item.quantity, charge_amount: item.estimated_value || 0,
                })),
                ...((latestCheck?.items_damaged as any[]) || []).map(item => ({
                  item_id: item.item_id, item_name: item.item_name, item_type: 'damaged' as const,
                  quantity: item.quantity, charge_amount: item.damage_cost || 0, damage_type: item.damage_type,
                })),
                // items_consumed excluded — already tracked via chargeable_consumptions
              ]
              
              setCheckoutDamageItems(damageItems)
              setShowCheckoutSummary(true)
            } catch (error: any) {
              toast({ variant: 'destructive', title: 'Lỗi tính toán', description: getFriendlyError(error) })
            }
          }}
          onTransferRoom={() => {
            toast({
              title: 'Chuyển phòng',
              description: 'Tính năng chuyển phòng đang phát triển. Vui lòng xử lý thủ công.',
            })
          }}
        />
      )}

      {/* Booking Payment Dialog - xử lý thanh toán chuẩn với lịch sử giao dịch */}
      {booking && (
        <BookingPaymentDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          booking={{
            id: booking.id,
            guest_name: guestName,
            room_number: roomNumber,
            total_amount: costBreakdown.totalAmount,
            amount_paid: amountPaid,
            deposit_amount: depositAmount,
            tenant_id: tenantId,
            hotel_id: hotelId,
          }}
          onPaymentComplete={(paidAmount?: number) => {
            setShowPaymentDialog(false)
            // Sync local state so UI updates immediately without re-opening dialog
            if (paidAmount && paidAmount > 0) {
              setAmountPaid(prev => prev + paidAmount)
            }
            invalidateQueries()
          }}
        />
      )}

      {showPrintReceiptDialog && printReceiptBookingId && (
        <PrintReceiptDialog
          open={showPrintReceiptDialog}
          onOpenChange={(o) => {
            setShowPrintReceiptDialog(o)
            if (!o) {
              setPrintReceiptBookingId(null)
              setPrintReceiptSubtotal(0)
              invalidateQueries()
              onOpenChange(false)
            }
          }}
          bookingId={printReceiptBookingId}
          guestName={guestName || booking?.guest_name || ''}
          roomNumber={roomNumber}
          subtotal={printReceiptSubtotal}
          tenantId={tenantId}
          hotelId={hotelId}
        />
      )}
    </>
  )
}
