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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { printInvoice, type HotelInfo } from './InvoicePDFTemplate'
import { VatRequestForm } from './VatRequestForm'

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
  subtotal,
  tenantId,
  hotelId,
  hotelInfo: hotelInfoProp,
}: PrintReceiptDialogProps) {
  const [vatEnabled, setVatEnabled] = useState(false)
  const [vatRate, setVatRate] = useState(10)
  const [showVatRequestForm, setShowVatRequestForm] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)

  // Reset state when dialog re-opens
  useEffect(() => {
    if (open) {
      setVatEnabled(false)
      setVatRate(10)
      setShowVatRequestForm(false)
    }
  }, [open, bookingId])

  // Fetch the auto-created receipt invoice for this booking
  const { data: invoice, isLoading: invoiceLoading } = useQuery({
    queryKey: ['invoice-for-booking', bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('guest_invoices')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: open && !!bookingId && !!tenantId,
    refetchInterval: (q) => (q.state.data ? false : 1000), // poll until invoice appears
    refetchOnWindowFocus: false,
  })

  // Fallback fetch hotel info if not passed in
  const { data: fetchedHotel } = useQuery({
    queryKey: ['hotel-info-for-receipt', hotelId],
    queryFn: async () => {
      const { data } = await supabase
        .from('hotels')
        .select('*')
        .eq('id', hotelId)
        .maybeSingle()
      return data as any
    },
    enabled: open && !!hotelId && !hotelInfoProp,
  })

  const hotelInfoSource = hotelInfoProp ?? fetchedHotel ?? undefined
  const hotelInfo: HotelInfo | undefined = hotelInfoSource
    ? {
        name: hotelInfoSource.name,
        address: hotelInfoSource.address ?? undefined,
        phone: hotelInfoSource.phone ?? undefined,
        taxCode: hotelInfoSource.tax_code ?? undefined,
      }
    : undefined

  const effectiveSubtotal = subtotal ?? invoice?.subtotal ?? 0
  const effectiveGuestName = guestName || invoice?.guest_name || ''
  const effectiveRoomNumber = roomNumber || invoice?.room_number || ''

  const safeRate = Math.max(0, Math.min(30, Number.isFinite(vatRate) ? vatRate : 0))
  const vatAmount = vatEnabled ? Math.round((effectiveSubtotal * safeRate) / 100) : 0
  const totalWithVat = effectiveSubtotal + vatAmount

  const handlePrint = async () => {
    if (!invoice) {
      toast.error('Chưa tạo được phiếu thu, vui lòng đợi…')
      return
    }
    setIsPrinting(true)
    try {
      const newVatRate = vatEnabled ? safeRate : 0
      const needUpdate =
        newVatRate !== (invoice.vat_rate ?? 0) ||
        vatAmount !== (invoice.vat_amount ?? 0) ||
        totalWithVat !== (invoice.total_amount ?? 0)

      let invoiceForPrint = invoice
      if (needUpdate) {
        const { data: updated, error } = await supabase
          .from('guest_invoices')
          .update({
            vat_rate: newVatRate,
            vat_amount: vatAmount,
            total_amount: totalWithVat,
          })
          .eq('id', invoice.id)
          .eq('tenant_id', tenantId)
          .select('*')
          .single()
        if (error) throw error
        invoiceForPrint = updated
      }

      await printInvoice(invoiceForPrint as any, 'K80', hotelInfo)
      toast.success('Đã gửi lệnh in phiếu thu')
      onOpenChange(false)
    } catch (e: any) {
      toast.error('Không in được phiếu thu', { description: e?.message })
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
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Thành tiền</span>
            <span className="font-medium">{formatCurrency(effectiveSubtotal)}</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="vat-enabled"
                checked={vatEnabled}
                onCheckedChange={setVatEnabled}
              />
              <Label htmlFor="vat-enabled" className="text-sm">
                Tính VAT
              </Label>
            </div>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={30}
                step={1}
                value={vatRate}
                disabled={!vatEnabled}
                onChange={(e) => setVatRate(Number(e.target.value))}
                className="h-8 w-16 text-right"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>

          {vatEnabled && (
            <div className="flex items-center justify-between text-sm text-amber-600">
              <span>VAT ({safeRate}%)</span>
              <span className="font-medium">{formatCurrency(vatAmount)}</span>
            </div>
          )}

          <Separator />

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">TỔNG CỘNG</span>
            <span className="text-lg font-bold">{formatCurrency(totalWithVat)}</span>
          </div>
        </div>

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
            subtotal={vatEnabled ? totalWithVat : effectiveSubtotal}
            onSuccess={() => { setShowVatRequestForm(false); onOpenChange(false) }}
            onCancel={() => setShowVatRequestForm(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

export default PrintReceiptDialog
