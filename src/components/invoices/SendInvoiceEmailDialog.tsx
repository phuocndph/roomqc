import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail, Paperclip } from 'lucide-react'
import { GuestInvoice } from '@/hooks/useGuestInvoices'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useQueryClient } from '@tanstack/react-query'
import { generateInvoicePDFBase64 } from './InvoicePDFTemplate'
import { getFriendlyError } from '@/lib/errorMessage'

interface Props {
  invoice: GuestInvoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
  hotelInfo?: { name?: string; address?: string; phone?: string; taxCode?: string }
}

export default function SendInvoiceEmailDialog({ invoice, open, onOpenChange, hotelInfo }: Props) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const handleOpen = () => {
    if (invoice) {
      setEmail(invoice.guest_email || invoice.guest_phone || '')
      setStatus('')
    }
  }

  const handleSend = async () => {
    if (!invoice || !email.trim()) return
    setSending(true)
    try {
      setStatus('Đang tạo file PDF...')
      const pdfBase64 = await generateInvoicePDFBase64(invoice, 'A4', hotelInfo)
      const filename = `${invoice.invoice_number}.pdf`

      setStatus('Đang gửi email...')
      const { error } = await supabase.functions.invoke('send-invoice-email', {
        body: {
          invoice_id: invoice.id,
          to_email: email.trim(),
          pdf_base64: pdfBase64,
          pdf_filename: filename,
        },
      })
      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['guest-invoices'] })
      toast({ title: 'Đã gửi hóa đơn kèm file PDF qua email' })
      onOpenChange(false)
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Lỗi gửi email', description: getFriendlyError(err) })
    } finally {
      setSending(false)
      setStatus('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) handleOpen(); onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-sm">Gửi hóa đơn qua email</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Gửi hóa đơn <span className="font-mono font-medium">{invoice?.invoice_number}</span> cho khách {invoice?.guest_name}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            <span>Đính kèm file PDF hóa đơn</span>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email người nhận *</Label>
            <Input className="h-8" type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          {status && <div className="text-xs text-muted-foreground animate-pulse">{status}</div>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="button" size="sm" className="h-8" onClick={handleSend} disabled={!email.trim() || sending}>
              <Mail className="h-3.5 w-3.5 mr-1" /> {sending ? 'Đang gửi...' : 'Gửi email'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
