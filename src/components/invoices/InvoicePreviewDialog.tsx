import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, Printer, Mail, QrCode, Loader2 } from 'lucide-react'
import { GuestInvoice } from '@/hooks/useGuestInvoices'
import { useVatClaimToken } from '@/hooks/useVatClaimToken'
import PaperSizeSelector, { PaperSize } from './PaperSizeSelector'
import {
  buildInvoiceHTMLAsync,
  buildVatClaimUrl,
  generateInvoicePDF,
  printInvoice,
  printVatQrSlip,
} from './InvoicePDFTemplate'

interface Props {
  invoice: GuestInvoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSendEmail?: (invoice: GuestInvoice) => void
  hotelInfo?: { name?: string; address?: string; phone?: string; taxCode?: string }
}

export default function InvoicePreviewDialog({ invoice, open, onOpenChange, onSendEmail, hotelInfo }: Props) {
  const [paperSize, setPaperSize] = useState<PaperSize>('K80')
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const { data: tokenData, isLoading: tokenLoading } = useVatClaimToken(open ? invoice?.id : null)

  const qrPayload = useMemo(() => {
    if (!invoice) return undefined
    const url = buildVatClaimUrl(invoice, tokenData?.token)
    if (!url) return undefined
    // Hiển thị URL ngắn dưới QR để khách gõ tay nếu cần
    const shortUrl = url.replace(/^https?:\/\//, '')
    return { url, label: `${shortUrl} · Hạn 7 ngày` }
  }, [invoice, tokenData?.token])

  const qrReady = !!qrPayload
  const qrBusy = tokenLoading || !qrReady

  useEffect(() => {
    if (!invoice || !open) return
    let cancelled = false
    setLoading(true)
    buildInvoiceHTMLAsync(invoice, paperSize, hotelInfo, qrPayload)
      .then(h => { if (!cancelled) setHtml(h) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, paperSize, open, qrPayload?.url, hotelInfo?.name, hotelInfo?.taxCode])

  if (!invoice) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-4 pt-4 pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <DialogTitle className="text-sm">Xem hóa đơn {invoice.invoice_number}</DialogTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <PaperSizeSelector value={paperSize} onChange={setPaperSize} />
              <Button type="button" variant="outline" size="sm" className="h-8" disabled={qrBusy} onClick={() => printInvoice(invoice, paperSize, hotelInfo, qrPayload)}>
                <Printer className="h-3.5 w-3.5 mr-1" /> In
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8" disabled={qrBusy} onClick={() => qrPayload && printVatQrSlip(invoice, qrPayload, hotelInfo)}>
                <QrCode className="h-3.5 w-3.5 mr-1" /> In QR VAT
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8" disabled={qrBusy} onClick={() => generateInvoicePDF(invoice, paperSize, hotelInfo, qrPayload)}>
                <Download className="h-3.5 w-3.5 mr-1" /> PDF
              </Button>
              {onSendEmail && (
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onSendEmail(invoice)}>
                  <Mail className="h-3.5 w-3.5 mr-1" /> Email
                </Button>
              )}
            </div>
          </div>
          {qrBusy && (
            <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Đang tạo mã QR lấy hoá đơn VAT…
            </div>
          )}
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto bg-muted/30 p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang dựng hoá đơn…
            </div>
          ) : (
            <div className="mx-auto bg-white shadow-md rounded" style={{ maxWidth: '820px' }}>
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
