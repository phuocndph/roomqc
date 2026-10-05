import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { supabase } from '@/integrations/supabase/client'

const schema = z.object({
  company_name: z.string().min(1, 'Bắt buộc'),
  guest_tax_code: z.string().min(10, 'MST tối thiểu 10 ký tự').max(14, 'MST tối đa 14 ký tự'),
  guest_address: z.string().optional(),
  accountant_email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
})

type VatRequestFormData = z.infer<typeof schema>

interface VatRequestFormProps {
  parentInvoiceId: string | null
  bookingId: string
  tenantId: string
  hotelId: string
  subtotal: number
  onSuccess: () => void
  onCancel: () => void
}

export function VatRequestForm({
  parentInvoiceId,
  bookingId,
  tenantId,
  hotelId,
  subtotal,
  onSuccess,
  onCancel,
}: VatRequestFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<VatRequestFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      company_name: '',
      guest_tax_code: '',
      guest_address: '',
      accountant_email: '',
    },
  })

  const onSubmit = async (data: VatRequestFormData) => {
    setIsSubmitting(true)
    try {
      const invoiceNumber = 'YC-' + Date.now()

      const { error } = await supabase.from('guest_invoices').insert({
        tenant_id: tenantId,
        hotel_id: hotelId,
        booking_id: bookingId,
        invoice_type: 'vat_request',
        status: 'pending',
        parent_invoice_id: parentInvoiceId,
        company_name: data.company_name,
        guest_tax_code: data.guest_tax_code,
        guest_address: data.guest_address || null,
        accountant_email: data.accountant_email || null,
        subtotal: subtotal,
        total_amount: subtotal,
        vat_rate: 0,
        vat_amount: 0,
        service_fee_rate: 0,
        service_fee_amount: 0,
        amount_paid: 0,
        deposit_amount: 0,
        guest_name: '',
        line_items: [],
        invoice_number: invoiceNumber,
      })

      if (error) throw error

      toast.success('Đã lưu yêu cầu HĐVAT. Kế toán sẽ xử lý.')
      onSuccess()
    } catch (e: any) {
      toast.error('Không lưu được yêu cầu HĐVAT', { description: e?.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="company_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Tên công ty <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <Input {...field} placeholder="CÔNG TY TNHH..." className="h-9" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="guest_tax_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Mã số thuế <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <Input
                  {...field}
                  inputMode="numeric"
                  placeholder="0123456789"
                  className="h-9 font-mono text-xs"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="guest_address"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Địa chỉ công ty</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Số, đường, phường, quận, thành phố..." rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="accountant_email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Email kế toán</FormLabel>
              <FormControl>
                <Input {...field} type="email" placeholder="ketoan@congty.vn" className="h-9" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            ← Quay lại
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu yêu cầu
          </Button>
        </div>
      </form>
    </Form>
  )
}

export default VatRequestForm
