import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { addDays, addMonths, addHours, differenceInCalendarDays, format, setHours, setMinutes } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { toast as sonnerToast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useTenant } from '@/hooks/useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useHotelPricingRules } from '@/hooks/useHotelPricingRules'
import { formatCurrency } from '@/lib/utils'
import { OTA_SOURCES, OTA_DEFAULT_COMMISSION } from '@/lib/constants'
import { 
  BookingFormState, 
  BookingFormComputed, 
  StepValidation, 
  SelectedRoomWithPrice,
  BookingType,
  MONTHLY_DISCOUNTS,
  HOURLY_MIN_HOURS,
} from '../types'
import { AvailableRoom } from '@/hooks/useAvailableRooms'
import { getFriendlyError } from '@/lib/errorMessage'

// ===== Draft autosave (localStorage, 24h TTL) =====
const DRAFT_KEY = 'booking_wizard_draft_v1'
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const DRAFT_DATE_FIELDS = ['checkInDate', 'checkOutDate', 'hourlyDate', 'monthlyStartDate'] as const

function serializeDraft(state: BookingFormState): string {
  // Strip sensitive fields trước khi lưu
  const { guestIdImageUrl, guestIdNumber, ...rest } = state
  return JSON.stringify({ version: 1, savedAt: Date.now(), data: rest })
}

function readDraft(): BookingFormState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const env = JSON.parse(raw) as { version?: number; savedAt?: number; data?: any }
    if (!env?.savedAt || Date.now() - env.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY)
      return null
    }
    const data = env.data || {}
    // Revive Date fields
    DRAFT_DATE_FIELDS.forEach((f) => {
      if (data[f]) data[f] = new Date(data[f])
    })
    return data as BookingFormState
  } catch {
    return null
  }
}

function clearDraftStorage(): void {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* storage may be unavailable */ }
}


const initialState: BookingFormState = {
  // Booking type
  bookingType: 'daily',
  
  // Daily booking
  checkInDate: new Date(),
  checkOutDate: addDays(new Date(), 1),
  checkInTime: '14:00',
  checkOutTime: '12:00',
  
  // Hourly booking
  hourlyDate: new Date(),
  hourlyStartTime: '14:00',
  bookingHours: HOURLY_MIN_HOURS,
  
  // Monthly booking
  monthlyStartDate: new Date(),
  bookingMonths: 1,
  
  // Rooms
  selectedRooms: [],
  
  // Guest info
  guestName: '',
  guestPhone: '',
  guestEmail: '',
  guestCount: 1,
  bookingSource: 'walk_in',
  bookingReference: '',
  notes: '',
  
  // Guest ID
  guestIdType: '',
  guestIdNumber: '',
  guestNationality: '',
  guestDateOfBirth: '',
  guestGender: '',
  guestAddress: '',
  guestIdImageUrl: '',
  
  // Payment
  includeVat: true,
  vatRate: 8,
  includeServiceFee: true,
  serviceFeeRate: 5,
  depositAmount: 0,
  otaPaymentType: 'pay_at_hotel',
  otaPaidAmount: 0,
  otaCommissionRate: 0,
}

export function useBookingForm() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  const hotelId = (selectedHotel as any)?.id as string | undefined
  const { data: pricingRules } = useHotelPricingRules(hotelId)

  const [state, setState] = useState<BookingFormState>(initialState)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const pricingAppliedRef = useRef(false)

  // Apply hotel-specific pricing rules once they load (only if user hasn't manually changed)
  useEffect(() => {
    if (!pricingRules || pricingAppliedRef.current) return
    pricingAppliedRef.current = true
    setState((prev) => ({
      ...prev,
      vatRate: pricingRules.vatRate,
      serviceFeeRate: pricingRules.serviceFeeRate,
    }))
  }, [pricingRules])

  // Skip side-effects (clear-rooms + OTA defaults) ngay sau khi restore draft,
  // tránh việc effect dep [bookingType, dates...] xoá selectedRooms vừa khôi phục.
  const skipResetsRef = useRef(0)
  const restoreOfferedRef = useRef(false)
  const firstSaveSkipRef = useRef(true)

  // Check if OTA source
  const isOtaSource = useMemo(() => 
    OTA_SOURCES.includes(state.bookingSource), 
    [state.bookingSource]
  )

  // Auto-fill OTA commission rate when booking source changes
  useEffect(() => {
    if (skipResetsRef.current > 0) {
      skipResetsRef.current--
      return
    }
    if (isOtaSource) {
      const defaultRate = OTA_DEFAULT_COMMISSION[state.bookingSource] || 15
      setState(prev => ({
        ...prev,
        otaCommissionRate: defaultRate,
        otaPaymentType: 'pay_at_hotel',
        otaPaidAmount: 0,
      }))
    } else {
      setState(prev => ({
        ...prev,
        otaCommissionRate: 0,
        otaPaymentType: 'pay_at_hotel',
        otaPaidAmount: 0,
      }))
    }
  }, [state.bookingSource, isOtaSource])

  // Clear room selection when dates/type change
  useEffect(() => {
    if (skipResetsRef.current > 0) {
      skipResetsRef.current--
      return
    }
    setState(prev => ({
      ...prev,
      selectedRooms: [],
      depositAmount: 0,
    }))
  }, [state.bookingType, state.checkInDate, state.checkOutDate, state.hourlyDate, state.monthlyStartDate, state.bookingMonths])

  // === Mount: offer draft restore (one-shot) ===
  useEffect(() => {
    if (restoreOfferedRef.current) return
    restoreOfferedRef.current = true
    const draft = readDraft()
    if (!draft) return
    sonnerToast('Bạn có bản nháp đặt phòng chưa hoàn thành', {
      description: 'Khôi phục để tiếp tục, hoặc bỏ qua để bắt đầu lại.',
      duration: 12000,
      action: {
        label: 'Tiếp tục',
        onClick: () => {
          // Skip 2 reset effects (OTA + clear-rooms) sẽ chạy ngay sau setState
          skipResetsRef.current = 2
          // Bỏ qua autosave lần này (state thay đổi sẽ trigger save lại đúng nội dung)
          firstSaveSkipRef.current = true
          setState(draft)
          sonnerToast.success('Đã khôi phục bản nháp')
        },
      },
      cancel: {
        label: 'Bỏ qua',
        onClick: () => {
          clearDraftStorage()
        },
      },
    })
  }, [])

  // === Autosave draft (debounced 1000ms) ===
  useEffect(() => {
    if (firstSaveSkipRef.current) {
      firstSaveSkipRef.current = false
      return
    }
    const handle = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, serializeDraft(state))
      } catch {
        // ignore quota / serialization errors
      }
    }, 1000)
    return () => window.clearTimeout(handle)
  }, [state])



  // Computed values
  const computed: BookingFormComputed = useMemo(() => {
    let nights = 0
    let hours = 0
    let months = 0
    let displayDuration = ''
    
    // Calculate duration based on booking type
    if (state.bookingType === 'daily') {
      nights = state.checkInDate && state.checkOutDate 
        ? Math.max(1, differenceInCalendarDays(state.checkOutDate, state.checkInDate))
        : 0
      displayDuration = `${nights} đêm`
    } else if (state.bookingType === 'hourly') {
      hours = state.bookingHours || 0
      displayDuration = `${hours} giờ`
    } else if (state.bookingType === 'monthly') {
      months = state.bookingMonths || 0
      displayDuration = `${months} tháng`
    }
    
    // Tổng giá phòng theo loại đặt — chỉ dùng customPrice (đã set từ room_type_rates)
    let totalRoomPrice = 0
    state.selectedRooms.forEach(room => {
      totalRoomPrice += (room.customPrice || 0)
    })
    
    // Calculate subtotal based on duration
    let subtotal = 0
    if (state.bookingType === 'daily') {
      subtotal = totalRoomPrice * nights
    } else if (state.bookingType === 'hourly') {
      subtotal = totalRoomPrice * hours
    } else if (state.bookingType === 'monthly') {
      const discount = MONTHLY_DISCOUNTS[months] || 0
      const baseSubtotal = totalRoomPrice * months
      subtotal = baseSubtotal - Math.round(baseSubtotal * discount / 100)
    }
    
    const vatAmount = state.includeVat ? Math.round(subtotal * state.vatRate / 100) : 0
    const serviceFeeAmount = state.includeServiceFee ? Math.round(subtotal * state.serviceFeeRate / 100) : 0
    const estimatedTotal = subtotal + vatAmount + serviceFeeAmount
    
    const otaCommissionAmount = isOtaSource && state.otaCommissionRate > 0
      ? Math.round(estimatedTotal * state.otaCommissionRate / 100)
      : 0
    
    const netRevenue = estimatedTotal - otaCommissionAmount
    const remainingAmount = Math.max(0, estimatedTotal - state.depositAmount)

    return {
      nights,
      hours,
      months,
      totalRoomPrice,
      subtotal,
      vatAmount,
      serviceFeeAmount,
      estimatedTotal,
      otaCommissionAmount,
      netRevenue,
      remainingAmount,
      isOtaSource,
      displayDuration,
    }
  }, [state, isOtaSource])

  // Validation
  const validation: StepValidation = useMemo(() => {
    let isStep1Valid = false
    
    if (state.bookingType === 'daily') {
      isStep1Valid = !!(state.checkInDate && state.checkOutDate && state.checkOutDate > state.checkInDate)
    } else if (state.bookingType === 'hourly') {
      isStep1Valid = !!(state.hourlyDate && state.hourlyStartTime && state.bookingHours >= 2)
    } else if (state.bookingType === 'monthly') {
      isStep1Valid = !!(state.monthlyStartDate && state.bookingMonths >= 1)
    }
    
    return {
      isStep1Valid,
      isStep2Valid: state.selectedRooms.length > 0 && state.selectedRooms.every(r => r.customPrice > 0),
      isStep3Valid: state.guestName.trim().length > 0,
      isStep4Valid: true, // Payment is optional
    }
  }, [state])

  // Actions
  const updateState = useCallback((updates: Partial<BookingFormState>) => {
    setState(prev => ({ ...prev, ...updates }))
  }, [])

  const setDateTimeData = useCallback((data: {
    checkInDate?: Date
    checkOutDate?: Date
    checkInTime?: string
    checkOutTime?: string
  }) => {
    setState(prev => ({ ...prev, ...data }))
  }, [])

  const toggleRoomSelection = useCallback((room: AvailableRoom) => {
    setState(prev => {
      const exists = prev.selectedRooms.find(r => r.id === room.id)
      if (exists) {
        return { ...prev, selectedRooms: prev.selectedRooms.filter(r => r.id !== room.id) }
      }
      // Lấy giá từ room_type_rates theo đúng loại đặt — KHÔNG fallback giá legacy
      let customPrice = 0
      if (prev.bookingType === 'daily') {
        customPrice = room.rate_daily ?? 0
      } else if (prev.bookingType === 'hourly') {
        // Nếu có block giờ đầu thì lấy giá block (cho 1 giờ tham chiếu); người dùng có thể bấm "Áp dụng giá theo bảng" để tính chính xác theo số giờ
        customPrice = room.rate_hourly ?? 0
      } else if (prev.bookingType === 'monthly') {
        customPrice = room.rate_monthly ?? 0
      }
      if (!room.pricing_configured || customPrice <= 0) {
        toast({
          variant: 'destructive',
          title: `Phòng ${room.room_number} chưa cấu hình giá`,
          description: 'Vào Cài đặt → Bảng giá để cấu hình giá đêm/giờ/tháng cho loại phòng này.',
        })
        return prev
      }
      return {
        ...prev,
        selectedRooms: [...prev.selectedRooms, { ...room, customPrice }],
      }
    })
  }, [toast])

  const updateRoomPrice = useCallback((roomId: string, newPrice: number) => {
    setState(prev => ({
      ...prev,
      selectedRooms: prev.selectedRooms.map(room => 
        room.id === roomId ? { ...room, customPrice: newPrice, priceBreakdown: null } : room
      )
    }))
  }, [])

  const applyPricingV2 = useCallback(async (): Promise<{ ok: number; fail: number }> => {
    if (state.selectedRooms.length === 0) return { ok: 0, fail: 0 }
    if (!tenant?.id) return { ok: 0, fail: 0 }

    // Determine date range
    let fromTs: Date | undefined
    let toTs: Date | undefined
    let bookingTypeApi: 'daily' | 'overnight' | 'hourly' | 'monthly' = 'daily'

    if (state.bookingType === 'daily' && state.checkInDate && state.checkOutDate) {
      const [ih, im] = (state.checkInTime || '14:00').split(':').map(Number)
      const [oh, om] = (state.checkOutTime || '12:00').split(':').map(Number)
      fromTs = setMinutes(setHours(state.checkInDate, ih), im)
      toTs = setMinutes(setHours(state.checkOutDate, oh), om)
      bookingTypeApi = 'daily'
    } else if (state.bookingType === 'hourly' && state.hourlyDate) {
      const [sh, sm] = state.hourlyStartTime.split(':').map(Number)
      fromTs = setMinutes(setHours(state.hourlyDate, sh), sm)
      toTs = addHours(fromTs, state.bookingHours)
      bookingTypeApi = 'hourly'
    } else if (state.bookingType === 'monthly' && state.monthlyStartDate) {
      fromTs = state.monthlyStartDate
      toTs = addMonths(state.monthlyStartDate, state.bookingMonths)
      bookingTypeApi = 'monthly'
    }

    if (!fromTs || !toTs) {
      toast({ variant: 'destructive', title: 'Chưa đủ thông tin ngày/giờ' })
      return { ok: 0, fail: 0 }
    }

    // Resolve room_type_id (rooms.room_type is a code; lookup room_types)
    const codes = Array.from(new Set(state.selectedRooms.map(r => r.room_type).filter(Boolean)))
    const { data: rtRows } = await supabase
      .from('room_types')
      .select('id, code, hotel_id')
      .eq('tenant_id', tenant.id)
      .in('code', codes)
    const rtMap = new Map<string, string>()
    ;(rtRows ?? []).forEach((r: any) => {
      // prefer hotel-scoped match
      const key = `${r.code}|${r.hotel_id ?? ''}`
      rtMap.set(key, r.id)
      if (!rtMap.has(r.code)) rtMap.set(r.code, r.id)
    })

    let ok = 0, fail = 0
    const updates: Array<{ id: string; price: number; breakdown: any }> = []
    for (const room of state.selectedRooms) {
      const rtId = rtMap.get(`${room.room_type}|${room.hotel_id}`) ?? rtMap.get(room.room_type)
      if (!rtId) { fail++; continue }
      const { data, error } = await supabase.rpc('calculate_booking_price' as any, {
        p_room_type_id: rtId,
        p_booking_type: bookingTypeApi,
        p_from_ts: fromTs.toISOString(),
        p_to_ts: toTs.toISOString(),
        p_hotel_id: room.hotel_id ?? null,
        p_apply_early_late: true,
      })
      if (error || !data) { fail++; continue }
      const bd = data as any
      const units = Number(bd.units) || 1
      const subtotal = Number(bd.subtotal ?? bd.total ?? 0)
      // per-unit price (exclude early/late surcharges from per-unit rate)
      const perUnit = units > 0 ? Math.round(subtotal / units) : subtotal
      updates.push({ id: room.id, price: perUnit, breakdown: bd })
      ok++
    }

    if (updates.length > 0) {
      setState(prev => ({
        ...prev,
        selectedRooms: prev.selectedRooms.map(r => {
          const u = updates.find(x => x.id === r.id)
          return u ? { ...r, customPrice: u.price, priceBreakdown: u.breakdown } : r
        }),
      }))
    }
    return { ok, fail }
  }, [state, tenant, toast])

  const reset = useCallback(() => {
    clearDraftStorage()
    // Bỏ qua autosave lần tiếp theo để không re-save lại initialState
    firstSaveSkipRef.current = true
    setState(initialState)
  }, [])

  const discardDraft = useCallback(() => {
    clearDraftStorage()
  }, [])


  const submit = useCallback(async (onSuccess?: () => void): Promise<boolean> => {
    // Validation
    if (state.selectedRooms.length === 0) {
      toast({ variant: 'destructive', title: 'Vui lòng chọn ít nhất 1 phòng' })
      return false
    }
    
    if (!state.guestName.trim()) {
      toast({ variant: 'destructive', title: 'Vui lòng nhập tên khách' })
      return false
    }
    
    // Date validation based on booking type
    if (state.bookingType === 'daily') {
      if (!state.checkInDate || !state.checkOutDate) {
        toast({ variant: 'destructive', title: 'Vui lòng chọn ngày check-in/out' })
        return false
      }
      if (state.checkOutDate <= state.checkInDate) {
        toast({ variant: 'destructive', title: 'Ngày check-out phải sau ngày check-in' })
        return false
      }
    } else if (state.bookingType === 'hourly') {
      if (!state.hourlyDate || !state.hourlyStartTime) {
        toast({ variant: 'destructive', title: 'Vui lòng chọn ngày và giờ bắt đầu' })
        return false
      }
    } else if (state.bookingType === 'monthly') {
      if (!state.monthlyStartDate) {
        toast({ variant: 'destructive', title: 'Vui lòng chọn ngày bắt đầu' })
        return false
      }
    }
    
    const hasInvalidPrice = state.selectedRooms.some(room => (room.customPrice || 0) <= 0)
    if (hasInvalidPrice) {
      toast({ variant: 'destructive', title: 'Vui lòng nhập giá cho tất cả các phòng' })
      return false
    }

    // Calculate dates based on booking type
    let checkIn: string
    let checkOut: string
    let hourlyStartTime: string | null = null
    let hourlyEndTime: string | null = null
    
    if (state.bookingType === 'daily') {
      checkIn = format(state.checkInDate!, 'yyyy-MM-dd')
      checkOut = format(state.checkOutDate!, 'yyyy-MM-dd')
    } else if (state.bookingType === 'hourly') {
      checkIn = format(state.hourlyDate!, 'yyyy-MM-dd')
      checkOut = format(state.hourlyDate!, 'yyyy-MM-dd') // Same day
      
      // Calculate exact timestamps
      const [startHour, startMin] = state.hourlyStartTime.split(':').map(Number)
      const startDateTime = setMinutes(setHours(state.hourlyDate!, startHour), startMin)
      const endDateTime = addHours(startDateTime, state.bookingHours)
      hourlyStartTime = startDateTime.toISOString()
      hourlyEndTime = endDateTime.toISOString()
    } else {
      // Monthly
      checkIn = format(state.monthlyStartDate!, 'yyyy-MM-dd')
      checkOut = format(addMonths(state.monthlyStartDate!, state.bookingMonths), 'yyyy-MM-dd')
    }

    // Validate no overlap for each room (parallel)
    const validationResults = await Promise.all(
      state.selectedRooms.map(async (room) => {
        if (state.bookingType === 'hourly') {
          const [{ data: hourlyData, error: hourlyError }, { data: dailyData, error: dailyError }] =
            await Promise.all([
              supabase.rpc('validate_hourly_booking', {
                p_room_id: room.id,
                p_start_time: hourlyStartTime!,
                p_end_time: hourlyEndTime!,
                p_exclude_booking_id: null,
              }),
              supabase.rpc('validate_hourly_against_daily', {
                p_room_id: room.id,
                p_booking_date: checkIn,
                p_exclude_booking_id: null,
              }),
            ])

          if (hourlyError) return { valid: false, room, message: hourlyError.message }
          const hourlyResult = hourlyData as { valid: boolean; message?: string }
          if (!hourlyResult.valid) {
            return { valid: false, room, message: hourlyResult.message || 'Phòng đã có lịch đặt theo giờ trong thời gian này' }
          }

          if (dailyError) return { valid: false, room, message: dailyError.message }
          const dailyResult = dailyData as { valid: boolean; message?: string }
          if (!dailyResult.valid) {
            return { valid: false, room, message: dailyResult.message || 'Phòng đã có khách đặt theo ngày/tháng trong ngày này' }
          }

          return { valid: true, room }
        } else {
          const { data, error } = await supabase.rpc('validate_booking_dates', {
            p_room_id: room.id,
            p_check_in: checkIn,
            p_check_out: checkOut,
            p_exclude_booking_id: null,
          })

          if (error) return { valid: false, room, message: getFriendlyError(error) }
          const result = data as { valid: boolean; message?: string }
          if (!result.valid) {
            return { valid: false, room, message: result.message || 'Vui lòng chọn ngày khác' }
          }

          return { valid: true, room }
        }
      })
    )

    // Check for any failures
    const firstFailure = validationResults.find(r => !r.valid)
    if (firstFailure) {
      toast({
        variant: 'destructive',
        title: `Phòng ${firstFailure.room.room_number} đã có lịch đặt`,
        description: firstFailure.message,
      })
      return false
    }
    
    setIsSubmitting(true)
    
    try {
      const bookingGroupId = state.selectedRooms.length > 1 ? crypto.randomUUID() : null
      const { nights, hours, months, vatAmount, serviceFeeAmount, subtotal, estimatedTotal } = computed
      
      const depositPerRoom = Math.round(state.depositAmount / state.selectedRooms.length)
      
      const bookingsData = state.selectedRooms.map((room, index) => {
        const roomPriceValue = room.customPrice
        const isLastRoom = index === state.selectedRooms.length - 1
        
        const roomDeposit = isLastRoom 
          ? state.depositAmount - (depositPerRoom * (state.selectedRooms.length - 1))
          : depositPerRoom
        
        // Calculate per-room totals
        let roomSubtotal = 0
        if (state.bookingType === 'daily') {
          roomSubtotal = roomPriceValue * nights
        } else if (state.bookingType === 'hourly') {
          roomSubtotal = roomPriceValue * hours
        } else if (state.bookingType === 'monthly') {
          const discount = MONTHLY_DISCOUNTS[months] || 0
          roomSubtotal = roomPriceValue * months
          roomSubtotal = roomSubtotal - Math.round(roomSubtotal * discount / 100)
        }
        
        const roomVat = state.includeVat ? Math.round(roomSubtotal * state.vatRate / 100) : 0
        const roomServiceFee = state.includeServiceFee ? Math.round(roomSubtotal * state.serviceFeeRate / 100) : 0
        const roomTotal = roomSubtotal + roomVat + roomServiceFee
        
        const roomOtaCommission = isOtaSource && state.otaCommissionRate > 0
          ? Math.round(roomTotal * state.otaCommissionRate / 100)
          : 0
        const roomNetRevenue = roomTotal - roomOtaCommission
        
        let finalPaymentStatus = 'pending'
        let finalAmountPaid = 0
        let finalDepositAmount = roomDeposit
        let roomOtaPaidAmount = 0
        
        if (isOtaSource && state.otaPaymentType === 'prepaid') {
          roomOtaPaidAmount = roomTotal
          finalPaymentStatus = 'paid'
          finalAmountPaid = roomTotal
          finalDepositAmount = roomTotal
        } else if (isOtaSource && state.otaPaymentType === 'partial_prepaid' && state.otaPaidAmount > 0) {
          roomOtaPaidAmount = Math.round(state.otaPaidAmount / state.selectedRooms.length)
          finalDepositAmount = roomOtaPaidAmount
          finalAmountPaid = roomOtaPaidAmount
          finalPaymentStatus = roomOtaPaidAmount >= roomTotal ? 'paid' : 'partial'
        } else {
          // Walk-in: deposit goes to deposit_amount only, amount_paid stays 0
          // Payment status based on deposit coverage
          finalPaymentStatus = roomDeposit >= roomTotal ? 'paid' : 'pending'
          // For walk-ins with deposit covering total, set amount_paid accordingly
          if (roomDeposit >= roomTotal) {
            finalAmountPaid = roomTotal - roomDeposit // Will be 0 or negative, use 0
            finalAmountPaid = 0
          }
        }
        
        return {
          room_id: room.id,
          hotel_id: room.hotel_id,
          tenant_id: tenant?.id,
          guest_name: state.guestName.trim(),
          guest_phone: state.guestPhone.trim() || null,
          guest_email: state.guestEmail.trim() || null,
          guest_count: state.selectedRooms.length === 1 ? state.guestCount : Math.ceil(state.guestCount / state.selectedRooms.length),
          check_in_date: checkIn,
          check_out_date: checkOut,
          expected_check_in_time: state.bookingType === 'hourly' ? state.hourlyStartTime : state.checkInTime,
          expected_check_out_time: state.bookingType === 'hourly' 
            ? format(addHours(new Date(`2000-01-01T${state.hourlyStartTime}`), state.bookingHours), 'HH:mm')
            : state.checkOutTime,
          status: 'confirmed',
          notes: state.notes.trim() || null,
          room_price: roomPriceValue,
          deposit_amount: finalDepositAmount,
          amount_paid: finalAmountPaid,
          payment_status: finalPaymentStatus,
          booking_source: state.bookingSource,
          booking_reference: state.bookingReference.trim() || null,
          subtotal: roomSubtotal,
          vat_rate: state.includeVat ? state.vatRate : 0,
          vat_amount: roomVat,
          service_fee_rate: state.includeServiceFee ? state.serviceFeeRate : 0,
          service_fee_amount: roomServiceFee,
          total_amount: roomTotal,
          booking_group_id: bookingGroupId,
          ota_payment_type: isOtaSource ? state.otaPaymentType : null,
          ota_paid_amount: isOtaSource && state.otaPaymentType !== 'pay_at_hotel' ? roomOtaPaidAmount : 0,
          ota_commission_rate: isOtaSource ? state.otaCommissionRate : null,
          ota_commission_amount: roomOtaCommission,
          net_revenue: roomNetRevenue,
          // New fields for booking type
          booking_type: state.bookingType,
          hourly_rate: state.bookingType === 'hourly' ? roomPriceValue : null,
          monthly_rate: state.bookingType === 'monthly' ? roomPriceValue : null,
          booking_hours: state.bookingType === 'hourly' ? state.bookingHours : null,
          booking_months: state.bookingType === 'monthly' ? state.bookingMonths : null,
          hourly_start_time: hourlyStartTime,
          hourly_end_time: hourlyEndTime,
          // Guest ID fields
          guest_id_type: state.guestIdType || null,
          guest_id_number: state.guestIdNumber || null,
          guest_nationality: state.guestNationality || null,
          guest_date_of_birth: state.guestDateOfBirth || null,
          guest_gender: state.guestGender || null,
          guest_address: state.guestAddress || null,
          guest_id_image_url: state.guestIdImageUrl || null,
          guest_id: null as string | null,
          price_breakdown: (room.priceBreakdown ?? null) as any,
        }
      })

      // Atomic: tạo guest + bookings trong 1 transaction qua RPC create_booking_v2
      // Tránh booking orphan khi insert guest fail giữa chừng.
      const guestPayload = state.guestName.trim()
        ? {
            full_name: state.guestName.trim(),
            phone: state.guestPhone.trim() || null,
            email: state.guestEmail.trim() || null,
            id_type: state.guestIdType || null,
            id_number: state.guestIdNumber || null,
            nationality: state.guestNationality || null,
            gender: state.guestGender || null,
            date_of_birth: state.guestDateOfBirth || null,
            address: state.guestAddress || null,
            id_image_url: state.guestIdImageUrl || null,
            vip_level: 'normal',
          }
        : null

      const { error } = await supabase.rpc('create_booking_v2' as any, {
        p_bookings: bookingsData as any,
        p_guest: guestPayload as any,
      })

      if (error) throw error
      
      const bookingTypeLabel = state.bookingType === 'hourly' ? 'theo giờ' : state.bookingType === 'monthly' ? 'theo tháng' : ''
      
      toast({
        title: state.selectedRooms.length > 1 
          ? `Đã đặt ${state.selectedRooms.length} phòng ${bookingTypeLabel} thành công`
          : `Đã tạo đặt phòng ${bookingTypeLabel} thành công`,
        description: state.depositAmount > 0 
          ? `Đã đặt cọc ${formatCurrency(state.depositAmount)}`
          : undefined,
      })
      
      queryClient.invalidateQueries({ queryKey: ['all-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['available-rooms'] })
      // Submit thành công → xoá draft
      clearDraftStorage()
      onSuccess?.()
      return true

    } catch (error: any) {
      console.error('Error saving booking:', error)
      toast({
        variant: 'destructive',
        title: 'Lỗi khi lưu đặt phòng',
        description: getFriendlyError(error),
      })
      return false
    } finally {
      setIsSubmitting(false)
    }
  }, [state, computed, isOtaSource, tenant, toast, queryClient])

  return {
    state,
    computed,
    validation,
    isSubmitting,
    updateState,
    setDateTimeData,
    toggleRoomSelection,
    updateRoomPrice,
    applyPricingV2,
    reset,
    discardDraft,
    submit,
  }
}
