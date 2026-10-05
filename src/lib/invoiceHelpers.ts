import { supabase } from '@/integrations/supabase/client'
import { Json } from '@/integrations/supabase/types'
import { differenceInDays, format } from 'date-fns'

export interface CreateInvoiceParams {
  bookingId: string
  tenantId: string
  hotelId: string
  userId?: string | null
  invoice_type?: 'receipt' | 'vat_request'
}


/**
 * Creates a guest invoice automatically after checkout.
 * Fire-and-forget: errors are logged but don't block checkout flow.
 */
export async function createInvoiceAfterCheckout({
  bookingId,
  tenantId,
  hotelId,
  userId,
  invoice_type,
}: CreateInvoiceParams): Promise<void> {

  // Wait for RPC commit and replication to sync before reading booking data
  await new Promise(resolve => setTimeout(resolve, 500))

  // 1. Fetch latest booking data (after RPC has updated total_amount, etc.)
  const { data: booking, error: bookingError } = await supabase
    .from('room_bookings')
    .select('*, room:rooms(room_number)')
    .eq('id', bookingId)
    .single()

  // Retry once if booking hasn't been updated yet
  if (!bookingError && booking && booking.status !== 'checked_out') {
    await new Promise(resolve => setTimeout(resolve, 1000))
    const { data: retryBooking, error: retryError } = await supabase
      .from('room_bookings')
      .select('*, room:rooms(room_number)')
      .eq('id', bookingId)
      .single()
    if (!retryError && retryBooking) {
      Object.assign(booking, retryBooking)
    }
  }

  if (bookingError || !booking) {
    console.error('Invoice: Failed to fetch booking', bookingError)
    return
  }

  // Check for duplicate invoice - prevent creating multiple invoices for same booking
  const { data: existingInvoice } = await supabase
    .from('guest_invoices')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('tenant_id', tenantId)
    .limit(1)

  if (existingInvoice && existingInvoice.length > 0) {
    return
  }

  // 2. Fetch service charges
  const { data: services } = await supabase
    .from('booking_service_charges')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('tenant_id', tenantId)

  // 3. Fetch chargeable consumptions
  const { data: consumables } = await supabase
    .from('chargeable_consumptions')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('tenant_id', tenantId)

  // 4. Build line items
  const lineItems: Array<{ description: string; quantity: number; unit_price: number; amount: number }> = []

  // Room charge - use actual_check_out for accurate nights calculation
  const roomPrice = booking.room_price || 0
  const checkIn = new Date(booking.check_in_date)
  // For checked_out bookings: prefer actual_check_out, then updated_at, then check_out_date
  const checkOut = booking.actual_check_out 
    ? new Date(booking.actual_check_out)
    : booking.status === 'checked_out' && booking.updated_at
      ? new Date(booking.updated_at)
      : new Date(booking.check_out_date)
  const nights = Math.max(1, differenceInDays(checkOut, checkIn))
  const roomNumber = (booking.room as any)?.room_number || ''

  if (booking.booking_type === 'hourly') {
    const hours = booking.booking_hours || 0
    const hourlyRate = booking.hourly_rate || 0
    lineItems.push({
      description: `Tiền phòng ${roomNumber} (${hours} giờ)`,
      quantity: hours,
      unit_price: hourlyRate,
      amount: hours * hourlyRate,
    })
    // Overtime charge for hourly bookings (stored in late_checkout_charge)
    const overtimeCharge = booking.late_checkout_charge || 0
    if (overtimeCharge > 0) {
      lineItems.push({
        description: 'Phí vượt giờ',
        quantity: 1,
        unit_price: overtimeCharge,
        amount: overtimeCharge,
      })
    }
  } else if (booking.booking_type === 'monthly') {
    const months = booking.booking_months || 0
    const monthlyRate = booking.monthly_rate || 0
    lineItems.push({
      description: `Tiền phòng ${roomNumber} (${months} tháng)`,
      quantity: months,
      unit_price: monthlyRate,
      amount: months * monthlyRate,
    })
  } else {
    lineItems.push({
      description: `Tiền phòng ${roomNumber} (${nights} đêm)`,
      quantity: nights,
      unit_price: roomPrice,
      amount: nights * roomPrice,
    })
  }

  // Early check-in charge
  const earlyCheckin = booking.early_checkin_charge || 0
  if (earlyCheckin > 0) {
    lineItems.push({
      description: 'Phụ thu nhận phòng sớm',
      quantity: 1,
      unit_price: earlyCheckin,
      amount: earlyCheckin,
    })
  }

  // Late checkout charge (only for daily/monthly bookings; hourly uses overtime above)
  const lateCheckout = booking.late_checkout_charge || 0
  if (lateCheckout > 0 && booking.booking_type !== 'hourly') {
    lineItems.push({
      description: 'Phụ thu trả phòng muộn',
      quantity: 1,
      unit_price: lateCheckout,
      amount: lateCheckout,
    })
  }

  // Extra charges
  const extraCharges = booking.extra_charges || 0
  if (extraCharges > 0) {
    lineItems.push({
      description: 'Phụ thu khác',
      quantity: 1,
      unit_price: extraCharges,
      amount: extraCharges,
    })
  }

  // Damage charges
  const damageCharges = booking.damage_charges || 0
  if (damageCharges > 0) {
    lineItems.push({
      description: 'Phí đền bù thiệt hại',
      quantity: 1,
      unit_price: damageCharges,
      amount: damageCharges,
    })
  }

  // Service charges from booking_service_charges table
  if (services && services.length > 0) {
    for (const svc of services) {
      lineItems.push({
        description: svc.service_name,
        quantity: svc.quantity,
        unit_price: svc.unit_price,
        amount: svc.total_price,
      })
    }
  }

  // Chargeable consumptions
  if (consumables && consumables.length > 0) {
    for (const c of consumables) {
      lineItems.push({
        description: c.item_name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        amount: c.total_amount || c.quantity * c.unit_price,
      })
    }
  }

  // 5. Use values from DB (already updated by perform_checkout RPC)
  const subtotal = booking.subtotal || 0
  const vatRate = booking.vat_rate || 0
  const vatAmount = booking.vat_amount || 0
  const serviceFeeRate = booking.service_fee_rate || 0
  const serviceFeeAmount = booking.service_fee_amount || 0
  const totalAmount = booking.total_amount || 0
  const depositAmount = booking.deposit_amount || 0
  const amountPaid = booking.amount_paid || 0

  // 6. Generate invoice number
  const { data: invoiceNumber, error: numError } = await supabase
    .rpc('generate_guest_invoice_number', { p_tenant_id: tenantId })

  if (numError || !invoiceNumber) {
    console.error('Invoice: Failed to generate number', numError)
    return
  }

  // 7. Insert guest invoice
  const { error: insertError } = await supabase
    .from('guest_invoices')
    .insert({
      tenant_id: tenantId,
      hotel_id: hotelId,
      booking_id: bookingId,
      invoice_number: invoiceNumber as string,
      guest_name: booking.guest_name,
      guest_phone: booking.guest_phone || null,
      guest_address: booking.guest_address || null,
      room_number: roomNumber,
      check_in_date: booking.check_in_date,
      check_out_date: booking.actual_check_out
        ? format(new Date(booking.actual_check_out), 'yyyy-MM-dd')
        : booking.check_out_date,
      line_items: lineItems as unknown as Json,
      subtotal,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      service_fee_rate: serviceFeeRate,
      service_fee_amount: serviceFeeAmount,
      total_amount: totalAmount,
      deposit_amount: depositAmount,
      amount_paid: amountPaid,
      payment_method: null,
      status: 'issued',
      issued_at: new Date().toISOString(),
      created_by: userId || null,
      invoice_type: invoice_type ?? 'receipt',
    } as any)


  if (insertError) {
    console.error('Invoice: Failed to create', insertError)
  }
}
