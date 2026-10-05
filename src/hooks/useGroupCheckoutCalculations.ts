import { useState, useCallback } from 'react'
import { format, isAfter, startOfDay } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import {
  calculateBookingCost,
  calculateLateCheckoutCharge,
  calculateHourlyOvertimeCharge,
  BookingCostBreakdown,
  DamageChargeItem,
  DEFAULT_PRICING_RULES,
} from '@/lib/bookingCalculations'
import { fetchServiceChargeSummary, type ServiceChargeDetail } from '@/hooks/useBookingServiceCharges'

export interface GroupBookingCostData {
  bookingId: string
  roomId: string
  roomNumber: string
  bookingType: 'daily' | 'hourly' | 'monthly'
  roomPrice: number
  nights: number
  hourlyRate?: number
  hours?: number
  monthlyRate?: number
  months?: number
  totalAmount: number
  depositAmount: number
  amountPaid: number
  checkInDate: Date
  checkOutDate: Date
  scheduledEndTime?: Date
}

export interface GroupRoomCostBreakdown {
  bookingId: string
  costBreakdown: BookingCostBreakdown
  lateCheckoutCharge: number
  adjustedLateCharge: number
  lateAdjustmentNote: string
  serviceCharges: number
  serviceDetails: ServiceChargeDetail[]
  damageItems: DamageChargeItem[]
  adjustedDamageItems: DamageChargeItem[]
  damageAdjustmentNote: string
  originalDamageTotal: number
}

export function useGroupCheckoutCalculations() {
  const [roomCosts, setRoomCosts] = useState<Map<string, GroupRoomCostBreakdown>>(new Map())
  const [isCalculating, setIsCalculating] = useState(false)

  // Fetch damage items from room_checks for a room
  const fetchDamageItems = useCallback(async (roomId: string, bookingId: string): Promise<DamageChargeItem[]> => {
    const { data: roomChecks } = await supabase
      .from('room_checks')
      .select('items_lost, items_damaged, items_consumed')
      .eq('room_id', roomId)
      .in('check_type', ['checkout'])
      .order('checked_at', { ascending: false })
      .limit(1)

    if (!roomChecks || roomChecks.length === 0) return []

    const roomCheck = roomChecks[0]
    const damageItems: DamageChargeItem[] = []

    // Process lost items
    const lostItems = (roomCheck.items_lost as any[]) || []
    for (const item of lostItems) {
      damageItems.push({
        item_id: item.item_id,
        item_name: item.item_name || 'Unknown',
        item_type: 'lost',
        quantity: item.quantity || 1,
        charge_amount: item.estimated_value || 0,
        notes: item.notes,
      })
    }

    // Process damaged items
    const damagedItems = (roomCheck.items_damaged as any[]) || []
    for (const item of damagedItems) {
      damageItems.push({
        item_id: item.item_id,
        item_name: item.item_name || 'Unknown',
        item_type: 'damaged',
        quantity: item.quantity || 1,
        charge_amount: item.damage_cost || 0,
        damage_type: item.damage_type,
        notes: item.notes,
      })
    }

    // items_consumed excluded — already tracked via chargeable_consumptions

    return damageItems
  }, [])

  // Calculate full costs for a single booking
  const calculateRoomCost = useCallback(async (booking: GroupBookingCostData): Promise<GroupRoomCostBreakdown> => {
    const actualTime = format(new Date(), 'HH:mm')
    const now = new Date()

    // 1. Calculate late checkout charge (only for daily, and NOT for overdue bookings)
    let lateCheckoutCharge = 0
    let hourlyOvertimeCharge = 0
    const isOverdue = booking.bookingType === 'daily' && isAfter(startOfDay(now), startOfDay(booking.checkOutDate))

    if (booking.bookingType === 'daily' && !isOverdue) {
      lateCheckoutCharge = calculateLateCheckoutCharge(
        actualTime,
        booking.roomPrice,
        now,
        booking.checkOutDate,
        DEFAULT_PRICING_RULES
      )
    } else if (booking.bookingType === 'hourly' && booking.scheduledEndTime) {
      hourlyOvertimeCharge = calculateHourlyOvertimeCharge(
        booking.scheduledEndTime,
        now,
        booking.hourlyRate || 0
      )
    }

    // 2. Get unified service charges (booking_service_charges + chargeable_consumptions)
    let serviceCharges = 0
    let serviceDetails: ServiceChargeDetail[] = []
    try {
      // Need tenant_id - fetch from booking
      const { data: bookingData } = await supabase
        .from('room_bookings')
        .select('tenant_id, service_charges')
        .eq('id', booking.bookingId)
        .single()
      
      if (bookingData?.tenant_id) {
        const summary = await fetchServiceChargeSummary(booking.bookingId, bookingData.tenant_id, { includeAllBilled: true })
        serviceCharges = summary.grandTotal
        serviceDetails = summary.details
      }

      // Fallback: if no details but service_charges > 0 on booking, create a summary item
      if (serviceDetails.length === 0 && serviceCharges === 0 && bookingData?.service_charges && Number(bookingData.service_charges) > 0) {
        serviceCharges = Number(bookingData.service_charges)
        serviceDetails = [{
          id: 'fallback-service',
          source: 'service' as const,
          service_name: 'Dịch vụ (chưa có chi tiết)',
          quantity: 1,
          unit_price: serviceCharges,
          total_price: serviceCharges,
        }]
      }
    } catch (e) {
      console.error('Error fetching service charges:', e)
    }

    // 3. Get damage items
    const damageItems = await fetchDamageItems(booking.roomId, booking.bookingId)
    const originalDamageTotal = damageItems.reduce((sum, item) => sum + item.charge_amount * item.quantity, 0)

    // 4. Calculate full cost breakdown
    const surchargeForCalc = booking.bookingType === 'hourly' ? hourlyOvertimeCharge : lateCheckoutCharge
    
    const costBreakdown = calculateBookingCost({
      bookingType: booking.bookingType,
      roomPrice: booking.roomPrice,
      nights: booking.nights,
      lateCheckoutCharge: booking.bookingType === 'daily' ? lateCheckoutCharge : 0,
      hourlyRate: booking.hourlyRate || 0,
      hours: booking.hours || 0,
      hourlyOvertimeCharge: booking.bookingType === 'hourly' ? hourlyOvertimeCharge : 0,
      monthlyRate: booking.monthlyRate || 0,
      months: booking.months || 0,
      serviceCharges,
      damageCharges: originalDamageTotal,
      damageItems,
      depositAmount: booking.depositAmount,
      amountPaid: booking.amountPaid,
    })

    return {
      bookingId: booking.bookingId,
      costBreakdown,
      lateCheckoutCharge: surchargeForCalc,
      adjustedLateCharge: surchargeForCalc,
      lateAdjustmentNote: '',
      serviceCharges,
      serviceDetails,
      damageItems,
      adjustedDamageItems: [...damageItems],
      damageAdjustmentNote: '',
      originalDamageTotal,
    }
  }, [fetchDamageItems])

  // Calculate costs for multiple bookings
  const calculateAllCosts = useCallback(async (bookings: GroupBookingCostData[]) => {
    setIsCalculating(true)
    try {
      const newCosts = new Map<string, GroupRoomCostBreakdown>()
      
      for (const booking of bookings) {
        const cost = await calculateRoomCost(booking)
        newCosts.set(booking.bookingId, cost)
      }
      
      setRoomCosts(newCosts)
      return newCosts
    } finally {
      setIsCalculating(false)
    }
  }, [calculateRoomCost])

  // Update late charge adjustment for a room
  const adjustLateCharge = useCallback((bookingId: string, newCharge: number, note: string) => {
    setRoomCosts(prev => {
      const current = prev.get(bookingId)
      if (!current) return prev
      
      const newMap = new Map(prev)
      const damageTotal = current.adjustedDamageItems.reduce((sum, i) => sum + i.charge_amount * i.quantity, 0)
      
      // Recalculate cost breakdown with new late charge
      const newCostBreakdown = calculateBookingCost({
        bookingType: current.costBreakdown.bookingType,
        roomPrice: current.costBreakdown.roomPricePerNight,
        nights: current.costBreakdown.nights,
        lateCheckoutCharge: current.costBreakdown.bookingType === 'daily' ? newCharge : 0,
        hourlyRate: current.costBreakdown.hourlyRate || 0,
        hours: current.costBreakdown.hours || 0,
        hourlyOvertimeCharge: current.costBreakdown.bookingType === 'hourly' ? newCharge : 0,
        monthlyRate: current.costBreakdown.monthlyRate || 0,
        months: current.costBreakdown.months || 0,
        serviceCharges: current.serviceCharges,
        damageCharges: damageTotal,
        damageItems: current.adjustedDamageItems,
        depositAmount: current.costBreakdown.depositAmount,
        amountPaid: current.costBreakdown.amountPaid,
      })
      
      newMap.set(bookingId, {
        ...current,
        adjustedLateCharge: newCharge,
        lateAdjustmentNote: note,
        costBreakdown: newCostBreakdown,
      })
      
      return newMap
    })
  }, [])

  // Adjust damage item charge
  const adjustDamageItemCharge = useCallback((bookingId: string, itemId: string, newCharge: number) => {
    setRoomCosts(prev => {
      const current = prev.get(bookingId)
      if (!current) return prev
      
      const newMap = new Map(prev)
      const newDamageItems = current.adjustedDamageItems.map(item =>
        item.item_id === itemId ? { ...item, charge_amount: newCharge } : item
      )
      const newDamageTotal = newDamageItems.reduce((sum, i) => sum + i.charge_amount * i.quantity, 0)
      
      // Recalculate cost breakdown
      const newCostBreakdown = calculateBookingCost({
        bookingType: current.costBreakdown.bookingType,
        roomPrice: current.costBreakdown.roomPricePerNight,
        nights: current.costBreakdown.nights,
        lateCheckoutCharge: current.costBreakdown.bookingType === 'daily' ? current.adjustedLateCharge : 0,
        hourlyRate: current.costBreakdown.hourlyRate || 0,
        hours: current.costBreakdown.hours || 0,
        hourlyOvertimeCharge: current.costBreakdown.bookingType === 'hourly' ? current.adjustedLateCharge : 0,
        monthlyRate: current.costBreakdown.monthlyRate || 0,
        months: current.costBreakdown.months || 0,
        serviceCharges: current.serviceCharges,
        damageCharges: newDamageTotal,
        damageItems: newDamageItems,
        depositAmount: current.costBreakdown.depositAmount,
        amountPaid: current.costBreakdown.amountPaid,
      })
      
      newMap.set(bookingId, {
        ...current,
        adjustedDamageItems: newDamageItems,
        costBreakdown: newCostBreakdown,
      })
      
      return newMap
    })
  }, [])

  // Set damage adjustment note
  const setDamageNote = useCallback((bookingId: string, note: string) => {
    setRoomCosts(prev => {
      const current = prev.get(bookingId)
      if (!current) return prev
      
      const newMap = new Map(prev)
      newMap.set(bookingId, { ...current, damageAdjustmentNote: note })
      return newMap
    })
  }, [])

  // Reset all costs
  const resetCosts = useCallback(() => {
    setRoomCosts(new Map())
  }, [])

  // Get aggregated totals for selected rooms
  const getAggregatedTotals = useCallback((selectedBookingIds: string[], totalGroupDeposit: number, isLastCheckout: boolean) => {
    let totalRoom = 0
    let totalLateCharge = 0
    let totalService = 0
    let totalDamage = 0
    let totalVat = 0
    let totalServiceFee = 0
    let totalSubtotal = 0
    let totalPaid = 0

    for (const bookingId of selectedBookingIds) {
      const cost = roomCosts.get(bookingId)
      if (!cost) continue
      
      totalRoom += cost.costBreakdown.roomTotal
      totalLateCharge += cost.adjustedLateCharge
      totalService += cost.serviceCharges
      totalDamage += cost.adjustedDamageItems.reduce((sum, i) => sum + i.charge_amount * i.quantity, 0)
      totalVat += cost.costBreakdown.vatAmount
      totalServiceFee += cost.costBreakdown.serviceFeeAmount
      totalSubtotal += cost.costBreakdown.subtotal
      totalPaid += cost.costBreakdown.amountPaid
    }

    const depositApplied = isLastCheckout ? totalGroupDeposit : 0
    const grandTotal = totalSubtotal + totalVat + totalServiceFee
    const remaining = grandTotal - totalPaid - depositApplied

    return {
      totalRoom,
      totalLateCharge,
      totalService,
      totalDamage,
      totalVat,
      totalServiceFee,
      totalSubtotal,
      grandTotal,
      totalPaid,
      depositApplied,
      remaining,
    }
  }, [roomCosts])

  return {
    roomCosts,
    isCalculating,
    calculateAllCosts,
    calculateRoomCost,
    adjustLateCharge,
    adjustDamageItemCharge,
    setDamageNote,
    resetCosts,
    getAggregatedTotals,
  }
}
