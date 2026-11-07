import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Receipt, Printer, FileText, Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { printInvoice, type HotelInfo } from './InvoicePDFTemplate'
import { VatRequestForm } from './VatRequestForm'
import type { GuestInvoice, InvoiceLineItem } from '@/hooks/useGuestInvoices'

interface PrintReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  guestName?: string
  roomNumber?: string
  subtotal?: number
  tenantId: string
  hotelId: string
  hotelInfo?: {
    name: string
    address?: string
    phone?: string
    tax_code?: string
  }
}

export function PrintReceiptDialog({
  open,
  onOpenChange,
  bookingId,
  guestName,
  roomNumber,
  tenantId,
  hotelId,
  hotelInfo: hotelInfoProp,
}: PrintReceiptDialogProps) {
  const [showVatRequestForm, setShowVatRequestForm] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)

  // Reset state when dialog re-opens
  useEffect(() => {
    if (open) {
      setShowVatRequestForm(false)
    }
  }, [open, bookingId, tenantId, hotelId])

  // Fetch the auto-created receipt invoice for this booking
  const { data: invoice, isLoading: invoiceLoading, error: invoiceError, refetch: refetchInvoice } = useQuery({
    queryKey: ['invoice-for-booking', tenantId, hotelId, bookingId],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('guest_invoices')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('tenant_id', tenantId)
        .eq('hotel_id', hotelId)
        .eq('invoice_type', 'receipt')
        .order('created_at', { ascending: false })
        .limit(1)
        .abortSignal(signal)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: open && !!bookingId && !!tenantId && !!hotelId,
    refetchInterval: q => !q.state.data && !q.state.error && q.state.dataUpdateCount < 5 ? 1000 : false,
    refetchOnWindowFocus: false,
  })

  // Fallback fetch hotel info if not passed in
  const { data: fetchedHotel } = useQuery({
    queryKey: ['hotel-info-for-receipt', tenantId, hotelId],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('hotels')
        .select('*')
        .eq('id', hotelId)
        .eq('tenant_id', tenantId)
        .abortSignal(signal)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: open && !!hotelId && !hotelInfoProp,
  })

  const hotelInfoSource = hotelInfoProp ?? fetchedHotel ?? undefined
  const hotelInfo: HotelInfo | undefined = hotelInfoSource
    ? {
        name: hotelInfoSource.name,
        address: hotelInfoSource.address ?? undefined,
        phone: hotelInfoSource.phone ?? undefined,
        taxCode: hotelInfoProp?.tax_code ?? undefined,
      }
    : undefined

  const effectiveSubtotal = invoice?.subtotal ?? 0
  const effectiveGuestName = guestName || invoice?.guest_name || ''
  const effectiveRoomNumber = roomNumber || invoice?.room_number || ''

  const totalAmount = invoice?.total_amount ?? 0

  const handlePrint = async () => {
    if (!invoice) {
      toast.error('Chưa tạo được phiếu thu, vui lòng đợi…')
      return
    }
    setIsPrinting(true)
    try {
      // Printing never changes the issued quote, VAT or service fee.
      await printInvoice({ ...invoice, line_items: invoice.line_items as unknown as InvoiceLineItem[] } as GuestInvoice, 'K80', hotelInfo)
      toast.success('Đã gửi lệnh in phiếu thu')
      onOpenChange(false)
    } catch {
      toast.error('Không in được phiếu thu. Vui lòng thử lại.')
    } finally {
      setIsPrinting(false)
    }
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            In phiếu thu
          </DialogTitle>
          <DialogDescription>
            {effectiveGuestName} · Phòng {effectiveRoomNumber}
          </DialogDescription>
        </DialogHeader>

        {/* Section 1: Totals */}
        {invoice && <div className="space-y-3 rounded-none border p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Thành tiền</span>
            <span className="font-medium">{formatCurrency(effectiveSubtotal)}</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">VAT ({invoice?.vat_rate ?? 0}%)</span>
            <span>{formatCurrency(invoice?.vat_amount ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Phí dịch vụ ({invoice?.service_fee_rate ?? 0}%)</span>
            <span>{formatCurrency(invoice?.service_fee_amount ?? 0)}</span>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">TỔNG CỘNG</span>
            <span className="text-lg font-bold">{formatCurrency(totalAmount)}</span>
          </div>
        </div>}

        {invoiceLoading && <p role="status" className="text-sm">Đang tải phiếu thu…</p>}

        {!invoiceLoading && !invoice && (
          <div role="status" className="space-y-2 border p-3 text-sm">
            <p>{invoiceError ? 'Chưa tải được phiếu thu.' : 'Chưa có phiếu thu đã xác nhận. Không thực hiện trả phòng lại.'}</p>
            <Button type="button" variant="outline" onClick={() => void refetchInvoice()}>Kiểm tra lại phiếu thu</Button>
          </div>
        )}

        {/* Section 2: Actions */}
        {!showVatRequestForm ? (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="w-full"
              onClick={handlePrint}
              disabled={isPrinting || invoiceLoading || !invoice}
            >
              {isPrinting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              In phiếu thu
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setShowVatRequestForm(true)}
              disabled={invoiceLoading || !invoice}
            >
              <FileText className="mr-2 h-4 w-4" />
              Khách lấy HĐVAT
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Bỏ qua
            </Button>
          </div>
        ) : (
          <VatRequestForm
            parentInvoiceId={invoice?.id ?? null}
            bookingId={bookingId}
            tenantId={tenantId}
            hotelId={hotelId}
            subtotal={totalAmount}
            onSuccess={() => { setShowVatRequestForm(false); onOpenChange(false) }}
            onCancel={() => setShowVatRequestForm(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

export default PrintReceiptDialog
