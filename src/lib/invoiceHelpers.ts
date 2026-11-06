import { supabase } from '@/integrations/supabase/client'

export interface CreateInvoiceParams {
  bookingId: string
  tenantId: string
  hotelId: string
  userId?: string | null
  invoice_type?: 'receipt' | 'vat_request'
}

/**
 * @deprecated Checkout now issues its receipt in the server transaction.
 * Retained as a read-only compatibility check; it never creates an invoice.
 */
export async function createInvoiceAfterCheckout({
  bookingId, tenantId, hotelId, invoice_type,
}: CreateInvoiceParams): Promise<void> {
  if (invoice_type && invoice_type !== 'receipt') throw new Error('Yêu cầu hóa đơn VAT cần dùng chức năng riêng.')
  const { data, error } = await supabase.from('guest_invoices').select('id')
    .eq('booking_id', bookingId).eq('tenant_id', tenantId).eq('hotel_id', hotelId)
    .eq('invoice_type', 'receipt').limit(1).maybeSingle()
  if (error || !data) throw new Error('Chưa xác nhận được phiếu thu. Kiểm tra riêng, không thực hiện trả phòng lại.')
}
