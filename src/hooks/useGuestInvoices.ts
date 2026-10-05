import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useToast } from '@/hooks/use-toast'
import { Json } from '@/integrations/supabase/types'
import { getFriendlyError } from '@/lib/errorMessage'

export interface GuestInvoice {
  id: string
  tenant_id: string
  hotel_id: string
  booking_id: string | null
  invoice_number: string
  guest_name: string
  guest_phone: string | null
  guest_address: string | null
  guest_tax_code: string | null
  company_name: string | null
  room_number: string | null
  check_in_date: string | null
  check_out_date: string | null
  line_items: InvoiceLineItem[]
  subtotal: number
  vat_rate: number
  vat_amount: number
  service_fee_rate: number
  service_fee_amount: number
  total_amount: number
  deposit_amount: number
  amount_paid: number
  payment_method: string | null
  notes: string | null
  status: string
  issued_at: string | null
  created_by: string | null
  guest_email: string | null
  email_sent_at: string | null
  created_at: string
  updated_at: string
  invoice_type?: string
  accountant_email?: string | null
}

export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

export function useGuestInvoices(filters?: { status?: string; search?: string; invoice_type?: string; from?: Date; to?: Date }) {
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  const tenantId = tenant?.id
  const hotelId = selectedHotel?.id

  return useQuery({
    queryKey: ['guest-invoices', tenantId, hotelId, filters],
    queryFn: async () => {
      if (!tenantId) return []

      let query = supabase
        .from('guest_invoices')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      if (hotelId) {
        query = query.eq('hotel_id', hotelId)
      }

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      if (filters?.invoice_type) {
        query = query.eq('invoice_type', filters.invoice_type)
      }

      if (filters?.from) {
        query = query.gte('created_at', filters.from.toISOString())
      }

      if (filters?.to) {
        query = query.lte('created_at', filters.to.toISOString())
      }

      if (filters?.search) {
        query = query.or(`guest_name.ilike.%${filters.search}%,invoice_number.ilike.%${filters.search}%,guest_phone.ilike.%${filters.search}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(row => ({
        ...row,
        line_items: (row.line_items || []) as unknown as InvoiceLineItem[],
      })) as GuestInvoice[]
    },
    enabled: !!tenantId,
  })
}


export function useCreateGuestInvoice() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (invoice: {
      tenant_id: string
      hotel_id: string
      booking_id?: string | null
      guest_name: string
      guest_phone?: string | null
      guest_address?: string | null
      guest_tax_code?: string | null
      company_name?: string | null
      room_number?: string | null
      check_in_date?: string | null
      check_out_date?: string | null
      line_items: InvoiceLineItem[]
      subtotal: number
      vat_rate: number
      vat_amount: number
      service_fee_rate: number
      service_fee_amount: number
      total_amount: number
      deposit_amount: number
      amount_paid: number
      payment_method?: string | null
      notes?: string | null
      status: string
      issued_at?: string | null
      created_by?: string | null
    }) => {
      // Generate invoice number
      const { data: numberData, error: numberError } = await supabase
        .rpc('generate_guest_invoice_number', { p_tenant_id: invoice.tenant_id })

      if (numberError) throw numberError

      const { data, error } = await supabase
        .from('guest_invoices')
        .insert({
          ...invoice,
          line_items: invoice.line_items as unknown as Json,
          invoice_number: numberData as string,
        })
        .select()
        .single()

      if (error) throw error
      return {
        ...data,
        line_items: (data.line_items || []) as unknown as InvoiceLineItem[],
      } as GuestInvoice
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-invoices'] })
      toast({ title: 'Đã tạo hóa đơn' })
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Lỗi tạo hóa đơn', description: getFriendlyError(error) })
    },
  })
}

export function useUpdateGuestInvoice() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<GuestInvoice> & { id: string }) => {
      const dbUpdates: Record<string, any> = { ...updates, updated_at: new Date().toISOString() }
      if (updates.line_items) {
        dbUpdates.line_items = updates.line_items as unknown as Json
      }

      const { data, error } = await supabase
        .from('guest_invoices')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return {
        ...data,
        line_items: (data.line_items || []) as unknown as InvoiceLineItem[],
      } as GuestInvoice
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-invoices'] })
      toast({ title: 'Đã cập nhật hóa đơn' })
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Lỗi', description: getFriendlyError(error) })
    },
  })
}
