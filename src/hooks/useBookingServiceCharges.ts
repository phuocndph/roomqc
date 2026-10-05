import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useToast } from '@/hooks/use-toast'
import type { BookingServiceCharge } from '@/types/services.types'
import { getFriendlyError } from '@/lib/errorMessage'

export interface ServiceChargeDetail {
  id: string
  service_name: string
  quantity: number
  unit_price: number
  total_price: number
  source: 'service' | 'minibar'
}

export interface ServiceChargeSummary {
  totalServiceCharges: number
  totalChargeableConsumptions: number
  grandTotal: number
  details: ServiceChargeDetail[]
}

/**
 * Fetch total service charges for a booking (booking_service_charges + chargeable_consumptions)
 */
export async function fetchServiceChargeSummary(
  bookingId: string,
  tenantId: string,
  options?: { includeAllBilled?: boolean }
): Promise<ServiceChargeSummary> {
  // Fetch booking_service_charges
  const { data: serviceCharges, error: scError } = await supabase
    .from('booking_service_charges')
    .select('id, service_name, quantity, unit_price, total_price')
    .eq('booking_id', bookingId)
    .eq('tenant_id', tenantId)

  if (scError) throw scError

  // Fetch chargeable_consumptions (minibar, paid items)
  let ccQuery = supabase
    .from('chargeable_consumptions')
    .select('id, item_name, quantity, unit_price, total_amount')
    .eq('booking_id', bookingId)
    .eq('tenant_id', tenantId)

  // For checkout totals, include all (billed + unbilled); for remaining balance, only unbilled
  if (!options?.includeAllBilled) {
    ccQuery = ccQuery.eq('is_billed', false)
  }

  const { data: consumptions, error: ccError } = await ccQuery

  if (ccError) throw ccError

  const serviceDetails: ServiceChargeDetail[] = (serviceCharges || []).map(sc => ({
    id: sc.id,
    service_name: sc.service_name,
    quantity: sc.quantity,
    unit_price: sc.unit_price,
    total_price: sc.total_price,
    source: 'service' as const,
  }))

  const consumptionDetails: ServiceChargeDetail[] = (consumptions || []).map(cc => ({
    id: cc.id,
    service_name: cc.item_name,
    quantity: cc.quantity,
    unit_price: cc.unit_price,
    total_price: cc.total_amount || cc.quantity * cc.unit_price,
    source: 'minibar' as const,
  }))

  const totalServiceCharges = serviceDetails.reduce((sum, d) => sum + d.total_price, 0)
  const totalChargeableConsumptions = consumptionDetails.reduce((sum, d) => sum + d.total_price, 0)

  return {
    totalServiceCharges,
    totalChargeableConsumptions,
    grandTotal: totalServiceCharges + totalChargeableConsumptions,
    details: [...serviceDetails, ...consumptionDetails],
  }
}

export function useBookingServiceCharges(bookingId: string | undefined) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id

  return useQuery({
    queryKey: ['booking-service-charges', bookingId, tenantId],
    queryFn: async () => {
      if (!bookingId || !tenantId) return []

      const { data, error } = await supabase
        .from('booking_service_charges')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []) as BookingServiceCharge[]
    },
    enabled: !!bookingId && !!tenantId,
  })
}

export function useAddServiceCharge() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (params: {
      bookingId: string
      serviceId: string | null
      serviceName: string
      quantity: number
      unitPrice: number
    }) => {
      if (!tenant?.id) throw new Error('Missing tenant')

      const { data: userData } = await supabase.auth.getUser()

      const totalPrice = params.quantity * params.unitPrice
      const { data, error } = await supabase
        .from('booking_service_charges')
        .insert({
          tenant_id: tenant.id,
          booking_id: params.bookingId,
          service_id: params.serviceId,
          service_name: params.serviceName,
          quantity: params.quantity,
          unit_price: params.unitPrice,
          total_price: totalPrice,
          created_by: userData?.user?.id || null,
        })
        .select()
        .single()

      if (error) throw error

      // Update booking service_charges total
      const { data: allCharges } = await supabase
        .from('booking_service_charges')
        .select('total_price')
        .eq('booking_id', params.bookingId)
        .eq('tenant_id', tenant.id)

      const totalServiceCharges = (allCharges || []).reduce((sum, c) => sum + (c.total_price || 0), 0)

      await supabase
        .from('room_bookings')
        .update({ service_charges: totalServiceCharges })
        .eq('id', params.bookingId)

      return { data, totalServiceCharges }
    },
    onSuccess: (result, params) => {
      queryClient.invalidateQueries({ queryKey: ['booking-service-charges', params.bookingId] })
      queryClient.invalidateQueries({ queryKey: ['room-booking'] })
      queryClient.invalidateQueries({ queryKey: ['all-bookings'] })
      toast({ title: 'Đã thêm dịch vụ' })
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Lỗi', description: getFriendlyError(error) })
    },
  })
}

export function useDeleteServiceCharge() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ chargeId, bookingId }: { chargeId: string; bookingId: string }) => {
      if (!tenant?.id) throw new Error('Missing tenant')

      const { error } = await supabase
        .from('booking_service_charges')
        .delete()
        .eq('id', chargeId)

      if (error) throw error

      // Recalculate booking service_charges total
      const { data: allCharges } = await supabase
        .from('booking_service_charges')
        .select('total_price')
        .eq('booking_id', bookingId)
        .eq('tenant_id', tenant.id)

      const totalServiceCharges = (allCharges || []).reduce((sum, c) => sum + (c.total_price || 0), 0)

      await supabase
        .from('room_bookings')
        .update({ service_charges: totalServiceCharges })
        .eq('id', bookingId)

      return { totalServiceCharges }
    },
    onSuccess: (result, params) => {
      queryClient.invalidateQueries({ queryKey: ['booking-service-charges', params.bookingId] })
      queryClient.invalidateQueries({ queryKey: ['room-booking'] })
      queryClient.invalidateQueries({ queryKey: ['all-bookings'] })
      toast({ title: 'Đã xóa dịch vụ' })
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Lỗi', description: getFriendlyError(error) })
    },
  })
}
