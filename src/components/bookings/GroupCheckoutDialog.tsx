import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DoorOpen,
  AlertTriangle,
  Loader2,
  Minimize2,
  Send,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, differenceInDays, isAfter, startOfDay } from 'date-fns'
import { formatVNCurrency } from '@/lib/pricing'
import { useGroupBooking, GroupBookingRoom, GroupBookingData } from '@/hooks/useGroupBooking'
import { useOnShiftStaffList, OnShiftStaffMember } from '@/hooks/useOnShiftStaffList'
import { supabase } from '@/integrations/supabase/client'
import { cn } from '@/lib/utils'
import { createInvoiceAfterCheckout } from '@/lib/invoiceHelpers'
import { PrintReceiptDialog } from '@/components/invoices/PrintReceiptDialog'
import { GroupPaymentDialog } from './GroupPaymentDialog'
import { useUser } from '@/hooks/useUser'
import { useGroupCheckoutCalculations, GroupBookingCostData } from '@/hooks/useGroupCheckoutCalculations'
import { isEarlyCheckout } from '@/lib/bookingCalculations'
import { DamageReportDocument } from './DamageReportDocument'
import { 
  triggerRoomCheckoutNotification,
  sendPushNotification,
  createInAppNotification,
  sendTelegramNotification 
} from '@/hooks/useNotificationTriggers'
import { StaffDetailSheet } from '@/components/staff/StaffDetailSheet'
import type { StaffWithStatus } from '@/hooks/useStaffStatus'
import type { Json } from '@/integrations/supabase/types'

import { GroupCheckoutRoomCard } from './group-checkout/GroupCheckoutRoomCard'
import { GroupCheckoutSummary } from './group-checkout/GroupCheckoutSummary'
import { GroupCheckoutStickyFooter } from './group-checkout/GroupCheckoutStickyFooter'

export interface GroupCheckoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingGroupId: string
  tenantId: string
  hotelId: string
  onCheckoutComplete?: () => void
  onMinimize?: () => void
}

interface Phase1DamageData {
  lost_items?: Array<{ item_id: string; item_name: string; quantity: number; estimated_value: number }>
  damaged_items?: Array<{ item_id: string; item_name: string; quantity: number; damage_cost: number; damage_type?: string }>
  consumed_items?: Array<{ item_id: string; item_name: string; quantity: number }>
  lost_total?: number
  damaged_total?: number
}

interface InspectionStatus {
  bookingId: string
  roomId: string
  status: 'pending' | 'in_progress' | 'completed' | 'not_requested' | 'cancelled'
  damageCharge?: number
  inspectionId?: string
  startedAt?: string
  createdAt?: string
  assignedTo?: string
  phase1DamageData?: Phase1DamageData
}

export function GroupCheckoutDialog({
  open,
  onOpenChange,
  bookingGroupId,
  tenantId,
  hotelId,
  onCheckoutComplete,
  onMinimize,
}: GroupCheckoutDialogProps) {
  const queryClient = useQueryClient()
  const { user } = useUser()
  const { data: groupData, isLoading: isLoadingGroup } = useGroupBooking(bookingGroupId)
  const { data: staffList = [], isLoading: isLoadingStaff } = useOnShiftStaffList(hotelId)
  
  const {
    roomCosts,
    isCalculating,
    calculateAllCosts,
    adjustLateCharge,
    adjustDamageItemCharge,
    setDamageNote,
    resetCosts,
  } = useGroupCheckoutCalculations()
  
  const [isProcessing, setIsProcessing] = useState(false)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set())
  
  const [selectedStaffForDetail, setSelectedStaffForDetail] = useState<StaffWithStatus | null>(null)
  const [staffDetailOpen, setStaffDetailOpen] = useState(false)
  
  const [showDamageReport, setShowDamageReport] = useState(false)
  const [selectedRoomForReport, setSelectedRoomForReport] = useState<string | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set())
  const [staffAssignments, setStaffAssignments] = useState<Map<string, string>>(new Map())

  const [receiptBookingId, setReceiptBookingId] = useState<string | null>(null)
  const [showReceiptDialog, setShowReceiptDialog] = useState(false)

  // Initialize selected rooms when groupData loads
  useEffect(() => {
    if (groupData?.bookings) {
      const checkedInRooms = groupData.bookings
        .filter(b => b.status === 'checked_in')
        .map(b => b.id)
      setSelectedRooms(new Set(checkedInRooms))
    }
  }, [groupData?.bookings])
  
  // Reset costs when dialog closes
  useEffect(() => {
    if (!open) {
      resetCosts()
      setExpandedRooms(new Set())
      setReceiptBookingId(null)
      setShowReceiptDialog(false)
    }
  }, [open, resetCosts])

  // Auto-calculate costs when dialog opens and selectedRooms change
  useEffect(() => {
    if (!open || !groupData || selectedRooms.size === 0) return
    
    const bookingsToCalc: GroupBookingCostData[] = Array.from(selectedRooms)
      .map(bookingId => {
        const booking = groupData.bookings.find(b => b.id === bookingId)
        if (!booking || booking.status === 'checked_out') return null
        const checkIn = new Date(booking.check_in_date)
        const checkOut = new Date(booking.check_out_date)
        const today = startOfDay(new Date())
        const isOverdue = isAfter(today, startOfDay(checkOut))
        const effectiveCheckOut = isOverdue ? today : checkOut
        const nights = Math.max(1, differenceInDays(effectiveCheckOut, checkIn))
        return {
          bookingId: booking.id,
          roomId: booking.room_id,
          roomNumber: booking.room?.room_number || '',
          bookingType: (booking.booking_type as 'daily' | 'hourly' | 'monthly') || 'daily',
          roomPrice: booking.room_price || 0,
          nights,
          hourlyRate: booking.hourly_rate ?? undefined,
          hours: booking.booking_hours ?? undefined,
          monthlyRate: booking.monthly_rate ?? undefined,
          months: booking.booking_months ?? undefined,
          totalAmount: booking.total_amount || 0,
          depositAmount: booking.deposit_amount || 0,
          amountPaid: booking.amount_paid || 0,
          checkInDate: checkIn,
          checkOutDate: checkOut,
        }
      })
      .filter(Boolean) as GroupBookingCostData[]
    
    if (bookingsToCalc.length > 0) {
      calculateAllCosts(bookingsToCalc)
    }
  }, [open, groupData, selectedRooms, calculateAllCosts])

  // Detect overdue rooms
  const overdueRooms = useMemo(() => {
    if (!groupData) return []
    const today = startOfDay(new Date())
    return groupData.bookings.filter(b => {
      if (b.status !== 'checked_in') return false
      const checkOutDate = startOfDay(new Date(b.check_out_date))
      return isAfter(today, checkOutDate)
    })
  }, [groupData])

  // Fetch inspection statuses
  const { data: inspectionStatuses, isLoading: isLoadingInspections, refetch: refetchInspections } = useQuery({
    queryKey: ['group-inspections', bookingGroupId],
    queryFn: async (): Promise<InspectionStatus[]> => {
      if (!groupData?.bookings) return []
      const bookingIds = groupData.bookings.map(b => b.id)
      
      const { data: inspections, error } = await supabase
        .from('checkout_inspection_requests')
        .select('*')
        .in('booking_id', bookingIds)
        .order('created_at', { ascending: false })

      if (error) throw error

      const roomCheckIds = inspections?.filter(i => i.room_check_id)?.map(i => i.room_check_id) || []
      let roomChecks: any[] | null = null
      if (roomCheckIds.length > 0) {
        const { data } = await supabase
          .from('room_checks')
          .select('id, room_id, items_lost, items_damaged, items_consumed')
          .in('id', roomCheckIds)
        roomChecks = data
      }
      if (!roomChecks || roomChecks.length === 0) {
        const { data } = await supabase
          .from('room_checks')
          .select('id, room_id, items_lost, items_damaged, items_consumed')
          .in('room_id', groupData.bookings.map(b => b.room_id))
          .in('check_type', ['checkout'])
          .order('checked_at', { ascending: false })
        roomChecks = data
      }

      return groupData.bookings.map(booking => {
        const inspection = inspections?.find(i => i.booking_id === booking.id)
        const roomCheck = roomChecks?.find(c => c.room_id === booking.room_id)
        
        let damageCharge = 0
        let phase1DamageData: Phase1DamageData | undefined
        
        if (roomCheck) {
          const lost = roomCheck.items_lost as any[] || []
          const damaged = roomCheck.items_damaged as any[] || []
          const consumed = roomCheck.items_consumed as any[] || []
          const lostTotal = lost.reduce((sum: number, item: any) => sum + (item.estimated_value || 0) * (item.quantity || 1), 0)
          const damagedTotal = damaged.reduce((sum: number, item: any) => sum + (item.damage_cost || 0) * (item.quantity || 1), 0)
          damageCharge = lostTotal + damagedTotal
          
          if (lost.length > 0 || damaged.length > 0 || consumed.length > 0) {
            phase1DamageData = {
              lost_items: lost.map((item: any) => ({ item_id: item.item_id || '', item_name: item.item_name || 'Không rõ', quantity: item.quantity || 1, estimated_value: item.estimated_value || 0 })),
              damaged_items: damaged.map((item: any) => ({ item_id: item.item_id || '', item_name: item.item_name || 'Không rõ', quantity: item.quantity || 1, damage_cost: item.damage_cost || 0, damage_type: item.damage_type })),
              consumed_items: consumed.map((item: any) => ({ item_id: item.item_id || '', item_name: item.item_name || 'Không rõ', quantity: item.quantity || 1 })),
              lost_total: lostTotal,
              damaged_total: damagedTotal,
            }
          }
        } else if (inspection?.phase1_damage_data) {
          const p1Data = inspection.phase1_damage_data as any as Phase1DamageData
          phase1DamageData = p1Data
          damageCharge = (p1Data.lost_total || 0) + (p1Data.damaged_total || 0)
        }

        if (!inspection) {
          return { bookingId: booking.id, roomId: booking.room_id, status: 'not_requested' as const, damageCharge }
        }

        const effectiveStatus = inspection.status === 'cancelled' ? 'not_requested' : inspection.status as 'pending' | 'in_progress' | 'completed'
        return {
          bookingId: booking.id,
          roomId: booking.room_id,
          status: effectiveStatus,
          inspectionId: inspection.status !== 'cancelled' ? inspection.id : undefined,
          startedAt: inspection.started_at,
          createdAt: inspection.created_at,
          assignedTo: inspection.assigned_to,
          damageCharge,
          phase1DamageData,
        }
      })
    },
    enabled: !!groupData?.bookings && open,
    // Bỏ polling 10s — đã có realtime channel cho checkout_inspection_requests + room_checks bên dưới
  })

  // Realtime subscriptions
  useEffect(() => {
    if (!groupData?.bookings || !open) return
    const bookingIds = groupData.bookings.map(b => b.id)
    const roomIds = groupData.bookings.map(b => b.room_id)
    
    const channel = supabase
      .channel(`group-inspections-realtime-${bookingGroupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkout_inspection_requests', filter: `booking_id=in.(${bookingIds.join(',')})` }, () => {
        refetchInspections()
        queryClient.invalidateQueries({ queryKey: ['group-inspections', bookingGroupId] })
      })
      .subscribe()
    
    const roomChecksChannel = supabase
      .channel(`group-roomchecks-realtime-${bookingGroupId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_checks', filter: `room_id=in.(${roomIds.join(',')})` }, () => refetchInspections())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'room_checks', filter: `room_id=in.(${roomIds.join(',')})` }, () => refetchInspections())
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(roomChecksChannel)
    }
  }, [groupData?.bookings, bookingGroupId, open, refetchInspections, queryClient])

  const inspectionMap = useMemo(() => {
    return new Map(inspectionStatuses?.map(i => [i.bookingId, i]) || [])
  }, [inspectionStatuses])

  // Calculate totals for selected rooms
  const totals = useMemo(() => {
    if (!groupData || !inspectionStatuses) {
      return { roomTotal: 0, damageCharges: 0, serviceCharges: 0, lateCharges: 0, earlyCheckinCharges: 0, extraCharges: 0, totalPaid: 0, subtotal: 0, vatAmount: 0, serviceFeeAmount: 0, grandTotal: 0, remaining: 0, depositApplied: 0, holdingDeposit: 0, isLastCheckout: false }
    }

    const selectedBookings = groupData.bookings.filter(b => selectedRooms.has(b.id))
    const remainingBookings = groupData.bookings.filter(b => !selectedRooms.has(b.id) && b.status !== 'checked_out')
    
    let roomTotal = 0, damageCharges = 0, serviceCharges = 0, lateCharges = 0, earlyCheckinCharges = 0, extraCharges = 0, totalPaid = 0

    for (const b of selectedBookings) {
      const cost = roomCosts.get(b.id)
      if (cost) {
        roomTotal += cost.costBreakdown.roomTotal
        lateCharges += cost.adjustedLateCharge
        earlyCheckinCharges += cost.costBreakdown.earlyCheckinCharge || 0
        extraCharges += cost.costBreakdown.extraCharges || 0
        serviceCharges += cost.serviceCharges
        damageCharges += cost.adjustedDamageItems.reduce((s, i) => s + i.charge_amount * i.quantity, 0)
        totalPaid += cost.costBreakdown.amountPaid
      } else {
        roomTotal += b.total_amount || 0
        totalPaid += b.amount_paid || 0
        serviceCharges += b.service_charges || 0
        const insp = inspectionMap.get(b.id)
        damageCharges += insp?.damageCharge || 0
      }
    }

    const isLastCheckout = remainingBookings.length === 0
    const depositApplied = isLastCheckout ? groupData.totalDeposit : 0
    const holdingDeposit = !isLastCheckout ? groupData.totalDeposit : 0
    
    const subtotal = roomTotal + damageCharges + serviceCharges + lateCharges + earlyCheckinCharges + extraCharges
    let vatAmount = 0
    let serviceFeeAmount = 0
    for (const b of selectedBookings) {
      const cost = roomCosts.get(b.id)
      if (cost) {
        vatAmount += cost.costBreakdown.vatAmount || 0
        serviceFeeAmount += cost.costBreakdown.serviceFeeAmount || 0
      }
    }
    const grandTotal = subtotal + vatAmount + serviceFeeAmount
    const remaining = grandTotal - totalPaid - depositApplied

    // Aggregate all service details from selected rooms
    const allServiceDetails: import('@/hooks/useBookingServiceCharges').ServiceChargeDetail[] = []
    for (const b of selectedBookings) {
      const cost = roomCosts.get(b.id)
      if (cost?.serviceDetails) {
        allServiceDetails.push(...cost.serviceDetails)
      }
    }

    return { roomTotal, damageCharges, serviceCharges, lateCharges, earlyCheckinCharges, extraCharges, totalPaid, subtotal, vatAmount, serviceFeeAmount, grandTotal, remaining, depositApplied, holdingDeposit, isLastCheckout, allServiceDetails }
  }, [groupData, inspectionStatuses, selectedRooms, inspectionMap, roomCosts])

  // Room stats
  const roomStats = useMemo(() => {
    if (!inspectionStatuses) return { ready: 0, inProgress: 0, pending: 0, needsRequest: 0 }
    const selectedInspections = inspectionStatuses.filter(i => selectedRooms.has(i.bookingId))
    return {
      ready: selectedInspections.filter(i => i.status === 'completed').length,
      inProgress: selectedInspections.filter(i => i.status === 'in_progress').length,
      pending: selectedInspections.filter(i => i.status === 'pending').length,
      needsRequest: selectedInspections.filter(i => i.status === 'not_requested').length,
    }
  }, [inspectionStatuses, selectedRooms])

  // Handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked && groupData) {
      const checkedInRooms = groupData.bookings.filter(b => b.status === 'checked_in').map(b => b.id)
      setSelectedRooms(new Set(checkedInRooms))
    } else {
      setSelectedRooms(new Set())
    }
  }

  const handleRoomSelect = (bookingId: string, checked: boolean) => {
    const newSelected = new Set(selectedRooms)
    if (checked) {
      newSelected.add(bookingId)
    } else {
      newSelected.delete(bookingId)
      const newAssignments = new Map(staffAssignments)
      newAssignments.delete(bookingId)
      setStaffAssignments(newAssignments)
    }
    setSelectedRooms(newSelected)
  }

  const handleStaffChange = (bookingId: string, staffId: string) => {
    const newAssignments = new Map(staffAssignments)
    newAssignments.set(bookingId, staffId)
    setStaffAssignments(newAssignments)
  }

  const toggleRoomExpand = (bookingId: string) => {
    setExpandedRooms(prev => {
      const newSet = new Set(prev)
      if (newSet.has(bookingId)) newSet.delete(bookingId)
      else newSet.add(bookingId)
      return newSet
    })
  }

  // Batch send inspection requests
  const handleBatchInspectionRequest = async () => {
    const roomsToRequest = Array.from(selectedRooms).filter(bookingId => {
      const inspection = inspectionMap.get(bookingId)
      return !inspection || inspection.status === 'not_requested'
    })
    
    const missingStaff = roomsToRequest.filter(id => !staffAssignments.get(id))
    if (missingStaff.length > 0) {
      const booking = groupData?.bookings.find(b => b.id === missingStaff[0])
      toast.error(`Chưa chọn nhân viên cho phòng ${booking?.room?.room_number}`)
      return
    }
    
    if (roomsToRequest.length === 0) {
      toast.info('Tất cả phòng đã được gửi yêu cầu kiểm tra')
      return
    }
    
    setIsProcessing(true)
    try {
      for (const bookingId of roomsToRequest) {
        const booking = groupData?.bookings.find(b => b.id === bookingId)
        const staffId = staffAssignments.get(bookingId)
        if (!booking || !staffId) continue
        
        const { data: inspectionData, error: inspectionError } = await supabase
          .from('checkout_inspection_requests')
          .insert({
            tenant_id: tenantId,
            hotel_id: hotelId,
            room_id: booking.room_id,
            booking_id: bookingId,
            assigned_to: staffId,
            requested_by: user?.id,
            status: 'pending',
          })
          .select('id')
          .single()

        if (inspectionError) continue
        
        await supabase.from('housekeeping_tasks').insert({
          tenant_id: tenantId,
          hotel_id: hotelId,
          room_id: booking.room_id,
          booking_id: bookingId,
          assigned_to: staffId,
          requested_by: user?.id,
          task_type: 'checkout_inspection',
          title: `Kiểm tra checkout P.${booking.room?.room_number}`,
          priority: 'high',
          status: 'pending',
          checkout_inspection_id: inspectionData.id,
        })
        
        const staff = staffList.find(s => s.id === staffId)
        const staffName = staff?.full_name || 'Nhân viên'
        const roomNumber = booking.room?.room_number || ''
        const guestName = booking.guest_name
        
        await Promise.all([
          sendPushNotification({ userId: staffId, tenantId, title: `Yêu cầu kiểm tra phòng ${roomNumber}`, body: `Khách ${guestName} sắp checkout. Vui lòng kiểm tra phòng.`, actionUrl: `/my-tasks`, notificationType: 'room_checkout' }),
          createInAppNotification({ userId: staffId, tenantId, title: `Yêu cầu kiểm tra phòng ${roomNumber}`, body: `Khách ${guestName} sắp checkout. Vui lòng kiểm tra phòng.`, type: 'room_checkout', actionUrl: `/my-tasks` }),
          sendTelegramNotification({ tenantId, hotelId, userIds: [staffId], title: `🔍 Yêu cầu kiểm tra phòng ${roomNumber}`, message: `Khách: ${guestName}\nVui lòng kiểm tra phòng trước khi checkout.`, notificationType: 'checkout', actionUrl: `/my-tasks` }),
          sendTelegramNotification({ tenantId, hotelId, sendToStaffGroups: true, title: `🔍 Yêu cầu kiểm tra phòng ${roomNumber}`, message: `Khách: ${guestName}\n👤 Giao cho: ${staffName}`, notificationType: 'checkout', actionUrl: `/my-tasks` }),
        ])
      }
      
      toast.success(`Đã gửi ${roomsToRequest.length} yêu cầu kiểm tra`)
      refetchInspections()
    } catch (error) {
      console.error('Error sending inspection requests:', error)
      toast.error('Lỗi gửi yêu cầu kiểm tra')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancelInspection = async (inspectionId: string) => {
    try {
      const { error } = await supabase
        .from('checkout_inspection_requests')
        .update({ status: 'cancelled' })
        .eq('id', inspectionId)
      if (error) throw error
      toast.success('Đã hủy yêu cầu kiểm tra')
      refetchInspections()
    } catch (error) {
      toast.error('Lỗi hủy yêu cầu kiểm tra')
    }
  }

  // Check if adjustments are valid
  const hasInvalidAdjustments = useMemo(() => {
    for (const bookingId of selectedRooms) {
      const cost = roomCosts.get(bookingId)
      if (!cost) continue
      const booking = groupData?.bookings.find(b => b.id === bookingId)
      if (!booking) continue
      
      if ((booking.booking_type || 'daily') === 'daily' && cost.adjustedLateCharge < cost.lateCheckoutCharge && !cost.lateAdjustmentNote.trim()) {
        return true
      }
      const currentDamageTotal = cost.adjustedDamageItems.reduce((s, i) => s + i.charge_amount * i.quantity, 0)
      if (currentDamageTotal < cost.originalDamageTotal && !cost.damageAdjustmentNote.trim()) {
        return true
      }
    }
    return false
  }, [selectedRooms, roomCosts, groupData])

  const buildCheckoutItems = useCallback((bookingIds: string[], includeCheckoutDate: boolean) => {
    if (!groupData) throw new Error('GROUP_BOOKING_NOT_FOUND')

    return bookingIds.map((bookingId) => {
      const booking = groupData.bookings.find(b => b.id === bookingId)
      const cost = roomCosts.get(bookingId)
      if (!booking || booking.status !== 'checked_in') {
        throw new Error('BOOKING_NOT_READY_FOR_CHECKOUT')
      }
      if (!cost) {
        throw new Error('CHECKOUT_COST_NOT_READY')
      }

      const damageCharges = cost.adjustedDamageItems.reduce(
        (sum, item) => sum + item.charge_amount * item.quantity,
        0,
      )
      const allNotes: string[] = []
      if (cost.lateAdjustmentNote) allNotes.push(`[Phụ thu: ${cost.lateAdjustmentNote}]`)
      if (cost.damageAdjustmentNote) allNotes.push(`[Đền bù: ${cost.damageAdjustmentNote}]`)

      const today = startOfDay(new Date())
      const bookingCheckOut = startOfDay(new Date(booking.check_out_date))
      const overdueDate = includeCheckoutDate && isAfter(today, bookingCheckOut)
        ? format(new Date(), 'yyyy-MM-dd')
        : null

      return {
        booking_id: booking.id,
        room_id: booking.room_id,
        late_checkout_charge: cost.adjustedLateCharge,
        service_charges: cost.serviceCharges,
        subtotal: cost.costBreakdown.subtotal,
        damage_charges: damageCharges,
        damage_notes: allNotes.join(' | ') || null,
        damage_items: cost.adjustedDamageItems as unknown as Json,
        check_out_date: overdueDate,
      }
    })
  }, [groupData, roomCosts])

  // Direct checkout
  const handleDirectCheckout = async () => {
    if (!groupData || isProcessing) return
    const readyRooms = Array.from(selectedRooms).filter(bookingId => {
      const booking = groupData.bookings.find(b => b.id === bookingId)
      if (!booking || booking.status !== 'checked_in') return false
      const inspection = inspectionMap.get(bookingId)
      return inspection?.status === 'completed' || inspection?.status === 'not_requested'
    })
    
    if (readyRooms.length === 0) {
      toast.error('Không có phòng nào sẵn sàng checkout')
      return
    }
    
    await performCheckout(readyRooms)
  }

  const handlePayAndCheckout = async () => {
    if (isProcessing) return
    if (totals.remaining > 0) {
      setIsProcessing(true)
      try {
        const checkoutItems = buildCheckoutItems([...selectedRooms], false)
        const { error } = await supabase.rpc('prepare_group_checkout_amounts', {
          p_checkouts: checkoutItems as unknown as Json,
        })
        if (error) throw error

        await queryClient.invalidateQueries({ queryKey: ['group-booking', bookingGroupId] })
        await queryClient.fetchQuery({ queryKey: ['group-booking', bookingGroupId] })
        setShowPaymentDialog(true)
      } catch (error) {
        console.error('Prepare group checkout payment error:', error)
        toast.error('Không thể lưu tổng tiền checkout nhóm')
      } finally {
        setIsProcessing(false)
      }
    } else {
      await handleDirectCheckout()
    }
  }

  // Actual checkout logic using RPC
  const performCheckout = async (bookingIds: string[]) => {
    if (!groupData || isProcessing) return
    
    setIsProcessing(true)
    try {
      const checkoutItems = buildCheckoutItems(bookingIds, true)
      const { error } = await supabase.rpc('perform_group_checkout', {
        p_checkouts: checkoutItems as unknown as Json,
      })
      if (error) throw error

      // Core booking/room changes above are atomic.  Notifications, inspection
      // completion and descriptive notes remain best-effort side effects.
      for (const bookingId of bookingIds) {
        const booking = groupData.bookings.find(b => b.id === bookingId)
        const cost = roomCosts.get(bookingId)
        if (!booking || !cost) continue

        const allNotes: string[] = []
        if (cost.lateAdjustmentNote) allNotes.push(`[Phụ thu: ${cost.lateAdjustmentNote}]`)
        if (cost.damageAdjustmentNote) allNotes.push(`[Đền bù: ${cost.damageAdjustmentNote}]`)
        if (allNotes.length > 0) {
          const existingNotes = booking.notes || ''
          const updateNotes = existingNotes ? `${existingNotes}\n${allNotes.join('\n')}` : allNotes.join('\n')
          await supabase.from('room_bookings').update({ notes: updateNotes }).eq('id', bookingId)
        }
          
        const inspection = inspectionMap.get(bookingId)
        if (inspection?.inspectionId) {
          await supabase.from('checkout_inspection_requests').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', inspection.inspectionId)
        }
        
        if (tenantId && hotelId) {
          triggerRoomCheckoutNotification({ tenantId, hotelId, roomId: booking.room_id, roomNumber: booking.room?.room_number || '' }).catch(console.error)
        }
      }

      for (const bookingId of bookingIds) {
        createInvoiceAfterCheckout({
          bookingId,
          tenantId,
          hotelId,
          userId: user?.id,
        }).catch(err => console.error('Failed to create invoice for booking', bookingId, err))
      }
      
      toast.success(`Đã checkout ${bookingIds.length} phòng thành công!`)

      // Show receipt for the first checked-out booking
      if (bookingIds.length > 0) {
        // Wait for invoices to be created (createInvoiceAfterCheckout uses setTimeout 500ms)
        setTimeout(() => {
          setReceiptBookingId(bookingIds[0])
          setShowReceiptDialog(true)
        }, 800)
      }

      const allRoomsNowDone = groupData.bookings.every(b => b.status === 'checked_out' || bookingIds.includes(b.id))
      if (allRoomsNowDone) {
        onOpenChange(false)
        onCheckoutComplete?.()
      }
      
      queryClient.invalidateQueries({ queryKey: ['all-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['group-booking', bookingGroupId] })
    } catch (error) {
      console.error('Error performing checkout:', error)
      toast.error('Lỗi checkout')
    } finally {
      setIsProcessing(false)
    }
  }

  // Print damage report
  const handlePrintReport = (bookingId: string) => {
    setSelectedRoomForReport(bookingId)
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
      setSelectedRoomForReport(null)
    }, 100)
  }

  const checkedInRooms = groupData?.bookings.filter(b => b.status === 'checked_in') || []
  const allSelected = selectedRooms.size === checkedInRooms.length && checkedInRooms.length > 0

  if (isLoadingGroup) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!groupData) return null

  const reportBooking = selectedRoomForReport ? groupData.bookings.find(b => b.id === selectedRoomForReport) : null
  const reportCost = selectedRoomForReport ? roomCosts.get(selectedRoomForReport) : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <DialogHeader className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-base">
                <DoorOpen className="h-4 w-4" />
                Checkout nhóm - {groupData.guestName} ({groupData.roomCount} phòng)
              </DialogTitle>
              <DialogDescription className="sr-only">Checkout nhóm booking</DialogDescription>
              {onMinimize && (
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 mr-6" onClick={onMinimize} aria-label="Thu nhỏ">
                  <Minimize2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {groupData.roomsCheckedOut > 0 && (
              <p className="text-xs text-muted-foreground">{groupData.roomsCheckedOut} phòng đã trả</p>
            )}
          </DialogHeader>

          {/* Scrollable Content */}
          <ScrollArea className="flex-1 overflow-auto">
            <div className="flex flex-col gap-3 px-4 pb-4">
              {/* Select All */}
              {checkedInRooms.length > 0 && (
                <div className="flex items-center gap-2 pb-1">
                  <Checkbox id="select-all" checked={allSelected} onCheckedChange={handleSelectAll} />
                  <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                    Chọn tất cả ({checkedInRooms.length} phòng đang ở)
                  </Label>
                </div>
              )}
              
              {/* Overdue Warning */}
              {overdueRooms.length > 0 && (
                <div className="flex items-start gap-2 p-2.5 border rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-red-600">
                    <span className="font-medium">{overdueRooms.length} phòng quá hạn checkout:</span>{' '}
                    {overdueRooms.map(b => `P.${b.room?.room_number}`).join(', ')}. Chi phí sẽ được tính đến ngày hôm nay.
                  </div>
                </div>
              )}

              {/* Loading skeleton when calculating */}
              {isCalculating && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              )}

              {/* Room List */}
              <div className="space-y-2">
                {groupData.bookings.map((booking) => (
                  <GroupCheckoutRoomCard
                    key={booking.id}
                    booking={booking}
                    inspection={inspectionMap.get(booking.id)}
                    cost={roomCosts.get(booking.id)}
                    isSelected={selectedRooms.has(booking.id)}
                    isExpanded={expandedRooms.has(booking.id)}
                    assignedStaff={staffAssignments.get(booking.id)}
                    staffList={staffList}
                    isProcessing={isProcessing}
                    onSelect={handleRoomSelect}
                    onToggleExpand={toggleRoomExpand}
                    onStaffChange={handleStaffChange}
                    onAdjustLateCharge={adjustLateCharge}
                    onAdjustDamageItemCharge={adjustDamageItemCharge}
                    onSetDamageNote={setDamageNote}
                    onPrintReport={handlePrintReport}
                    onViewStaffDetail={(staff) => {
                      setSelectedStaffForDetail(staff)
                      setStaffDetailOpen(true)
                    }}
                    onCancelInspection={handleCancelInspection}
                  />
                ))}
              </div>

              {/* Batch Inspection Request Button */}
              {roomStats.needsRequest > 0 && selectedRooms.size > 0 && (
                <Button type="button" variant="outline" className="w-full h-9" onClick={handleBatchInspectionRequest} disabled={isProcessing}>
                  {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Gửi yêu cầu kiểm tra ({roomStats.needsRequest} phòng)
                </Button>
              )}

              {/* Progress Warning */}
              {(roomStats.inProgress > 0 || roomStats.pending > 0) && (
                <div className="border rounded-lg p-2.5 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="text-sm text-amber-600">
                    {roomStats.inProgress > 0 && `${roomStats.inProgress} đang kiểm tra`}
                    {roomStats.inProgress > 0 && roomStats.pending > 0 && ', '}
                    {roomStats.pending > 0 && `${roomStats.pending} chờ kiểm tra`}
                    . Có thể checkout sau khi hoàn thành.
                  </span>
                </div>
              )}

              {/* Payment Summary Card */}
              <GroupCheckoutSummary
                totals={totals}
                selectedRoomCount={selectedRooms.size}
                roomsRemaining={groupData.roomsRemaining - selectedRooms.size}
                allServiceDetails={totals.allServiceDetails}
              />

              {/* Warning if unpaid */}
              {totals.remaining > 0 && (
                <div className="flex items-start gap-2 p-2.5 border rounded-md">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-600">
                    Khách chưa thanh toán đầy đủ. Vui lòng thu tiền trước khi cho trả phòng hoặc xác nhận checkout với số nợ.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Sticky Footer */}
          <GroupCheckoutStickyFooter
            remaining={totals.remaining}
            grandTotal={totals.grandTotal}
            selectedRoomCount={selectedRooms.size}
            isProcessing={isProcessing}
            isCalculating={isCalculating}
            hasInvalidAdjustments={hasInvalidAdjustments}
            onCancel={() => onOpenChange(false)}
            onMinimize={onMinimize}
            onDirectCheckout={handleDirectCheckout}
            onPayAndCheckout={handlePayAndCheckout}
          />
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      {receiptBookingId && (
        <PrintReceiptDialog
          open={showReceiptDialog}
          onOpenChange={(open) => {
            setShowReceiptDialog(open)
            if (!open) setReceiptBookingId(null)
          }}
          bookingId={receiptBookingId}
          tenantId={tenantId}
          hotelId={hotelId}
        />
      )}

      {/* Payment Dialog */}
      <GroupPaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        bookingGroupId={bookingGroupId}
        tenantId={tenantId}
        hotelId={hotelId}
        calculatedRemaining={totals.remaining}
        calculatedTotal={totals.grandTotal}
        bookingIds={[...selectedRooms]}
        roomCostsByBooking={
          Array.from(roomCosts.entries()).map(([bookingId, cost]) => ({
            bookingId,
            calculatedTotal: cost.costBreakdown.totalAmount,
          }))
        }
        onPaymentComplete={async () => {
          setShowPaymentDialog(false)
          await queryClient.invalidateQueries({ queryKey: ['group-booking', bookingGroupId] })
          const freshResult = await queryClient.fetchQuery({ queryKey: ['group-booking', bookingGroupId] }) as GroupBookingData | null
          if (freshResult) {
            const today = startOfDay(new Date())
            const bookingsToCalc = freshResult.bookings
              .filter(b => selectedRooms.has(b.id) && b.status === 'checked_in')
              .map(b => {
                const checkIn = new Date(b.check_in_date)
                const checkOut = new Date(b.check_out_date)
                const isOverdue = isAfter(today, startOfDay(checkOut))
                const effectiveCheckOut = isOverdue ? today : checkOut
                const nights = Math.max(1, differenceInDays(effectiveCheckOut, checkIn))
                return {
                  bookingId: b.id,
                  roomId: b.room_id,
                  roomNumber: b.room?.room_number || '',
                  bookingType: (b.booking_type || 'daily') as 'daily' | 'hourly' | 'monthly',
                  roomPrice: b.room_price || 0,
                  nights,
                  hourlyRate: b.hourly_rate ?? undefined,
                  hours: b.booking_hours ?? undefined,
                  monthlyRate: b.monthly_rate ?? undefined,
                  months: b.booking_months ?? undefined,
                  totalAmount: b.total_amount || 0,
                  depositAmount: b.deposit_amount || 0,
                  amountPaid: b.amount_paid || 0,
                  checkInDate: checkIn,
                  checkOutDate: checkOut,
                }
              })
            if (bookingsToCalc.length > 0) {
              await calculateAllCosts(bookingsToCalc)
            }
          }
          toast.success('Thanh toán thành công! Vui lòng kiểm tra phòng trước khi checkout.')
        }}
      />
      
      {/* Staff Detail Sheet */}
      <StaffDetailSheet
        staff={selectedStaffForDetail}
        open={staffDetailOpen}
        onOpenChange={setStaffDetailOpen}
      />

      {/* Hidden Damage Report for Printing */}
      {showDamageReport && reportBooking && reportCost && (
        <div className="hidden">
          <DamageReportDocument
            ref={reportRef}
            guestName={reportBooking.guest_name}
            roomNumber={reportBooking.room?.room_number || ''}
            checkoutDate={new Date()}
            damageItems={reportCost.adjustedDamageItems}
            totalCharge={reportCost.adjustedDamageItems.reduce((s, i) => s + i.charge_amount * i.quantity, 0)}
            adjustmentNote={reportCost.damageAdjustmentNote}
          />
        </div>
      )}
    </>
  )
}
