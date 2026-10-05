import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, Mail, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { GuestInvoice, useUpdateGuestInvoice } from '@/hooks/useGuestInvoices'
import { formatCurrency } from '@/lib/utils'

interface Props {
  invoice: GuestInvoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenEmail?: (invoice: GuestInvoice) => void
}

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  pending: { text: 'Chờ xử lý', tone: 'text-amber-600' },
  issued: { text: 'Đã xuất', tone: 'text-green-600' },
  cancelled: { text: 'Đã hủy', tone: 'text-red-600' },
  draft: { text: 'Nháp', tone: 'text-amber-600' },
}

function parseVatNumber(notes?: string | null): string | null {
  if (!notes) return null
  const m = notes.match(/HĐVAT:\s*([^\n]+)/i)
  return m ? m[1].trim() : null
}

function KV({ label, value, copyable }: { label: string; value?: string | null; copyable?: boolean }) {
  const display = value && value.trim() ? value : '—'
  const canCopy = copyable && value && value.trim()
  const handleCopy = () => {
    navigator.clipboard.writeText(value!.trim())
    toast.success('Đã copy')
  }
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <div className="text-xs text-muted-foreground w-32 flex-shrink-0">{label}</div>
      <div className="text-sm flex-1 break-words">{display}</div>
      {canCopy && (
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={handleCopy} aria-label="Sao chép">
          <Copy className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}

export default function VatRequestDetailDialog({ invoice, open, onOpenChange, onOpenEmail }: Props) {
  const [vatNumber, setVatNumber] = useState('')
  const updateInvoice = useUpdateGuestInvoice()

  const existingVatNumber = useMemo(() => parseVatNumber(invoice?.notes), [invoice?.notes])

  if (!invoice) return null

  const status = invoice.status
  const statusInfo = STATUS_LABEL[status] || { text: status, tone: '' }

  const handleConfirmIssued = () => {
    const num = vatNumber.trim()
    if (!num) {
      toast.error('Vui lòng nhập số HĐVAT đã xuất')
      return
    }
    const prefix = `HĐVAT: ${num}`
    const existingNotes = (invoice.notes || '').replace(/HĐVAT:\s*[^\n]+\n?/i, '').trim()
    const newNotes = existingNotes ? `${prefix}\n${existingNotes}` : prefix
    updateInvoice.mutate(
      { id: invoice.id, status: 'issued', issued_at: new Date().toISOString(), notes: newNotes },
      {
        onSuccess: () => {
          setVatNumber('')
          onOpenChange(false)
        },
      },
    )
  }

  const handleCancel = () => {
    updateInvoice.mutate(
      { id: invoice.id, status: 'cancelled' },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  const lineItems = invoice.line_items || []
  const vatRate = invoice.vat_rate || 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle className="text-sm">
              Yêu cầu HĐVAT · <span className="font-mono">{invoice.invoice_number}</span>
            </DialogTitle>
            <span className={`text-xs font-medium ${statusInfo.tone}`}>{statusInfo.text}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Tạo lúc {format(new Date(invoice.created_at), 'dd/MM/yyyy HH:mm')}
            {invoice.issued_at && status === 'issued' && (
              <> · Xuất lúc {format(new Date(invoice.issued_at), 'dd/MM/yyyy HH:mm')}</>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {/* Bên mua */}
          <div className="border rounded-lg p-3">
            <div className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">
              Bên mua (xuất hóa đơn cho)
            </div>
            <KV label="Tên công ty" value={invoice.company_name} copyable />
            <KV label="Mã số thuế" value={invoice.guest_tax_code} copyable />
            <KV label="Địa chỉ" value={invoice.guest_address} copyable />
            <KV label="Email kế toán" value={invoice.accountant_email} copyable />
          </div>

          {/* Lưu trú */}
          <div className="border rounded-lg p-3">
            <div className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">
              Thông tin lưu trú
            </div>
            <KV label="Khách" value={invoice.guest_name} />
            <KV label="Phòng" value={invoice.room_number} />
            <KV
              label="Check-in"
              value={invoice.check_in_date ? format(new Date(invoice.check_in_date), 'dd/MM/yyyy') : ''}
            />
            <KV
              label="Check-out"
              value={invoice.check_out_date ? format(new Date(invoice.check_out_date), 'dd/MM/yyyy') : ''}
            />
          </div>

          {/* Dịch vụ */}
          <div className="border rounded-lg p-3">
            <div className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">
              Chi tiết dịch vụ
            </div>
            {lineItems.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">Không có dịch vụ</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-1 font-medium">Mô tả</th>
                    <th className="text-right py-1 font-medium w-12">SL</th>
                    <th className="text-right py-1 font-medium w-24">Đơn giá</th>
                    <th className="text-right py-1 font-medium w-28">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineItems.map((li, i) => (
                    <tr key={i}>
                      <td className="py-1.5">{li.description}</td>
                      <td className="text-right py-1.5">{li.quantity}</td>
                      <td className="text-right py-1.5 font-mono text-xs">{formatCurrency(li.unit_price)}</td>
                      <td className="text-right py-1.5 font-mono text-xs">
                        {formatCurrency((li.quantity || 0) * (li.unit_price || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="border-t mt-2 pt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tạm tính</span>
                <span className="font-mono">{formatCurrency(invoice.subtotal)}</span>
              </div>
              {vatRate > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Thuế GTGT ({vatRate}%)</span>
                  <span className="font-mono">{formatCurrency(invoice.vat_amount || 0)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-base pt-1 border-t">
                <span>TỔNG CỘNG</span>
                <span className="font-mono">{formatCurrency(invoice.total_amount)}</span>
              </div>
            </div>
          </div>

          {/* Hành động */}
          {status === 'pending' && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div>
                <Label htmlFor="vat-number" className="text-xs">
                  Số HĐVAT đã xuất
                </Label>
                <Input
                  id="vat-number"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="VD: 1C25TAA/0001234"
                  className="h-9 mt-1 font-mono text-sm"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Nhập số HĐ điện tử thật để đối chiếu sau này.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={handleConfirmIssued}
                  disabled={updateInvoice.isPending}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Xác nhận đã xuất
                </Button>
                {invoice.accountant_email && onOpenEmail && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => onOpenEmail(invoice)}
                  >
                    <Mail className="h-4 w-4 mr-1" />
                    Gửi email kế toán
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-red-600 ml-auto"
                  onClick={handleCancel}
                  disabled={updateInvoice.isPending}
                >
                  <X className="h-4 w-4 mr-1" />
                  Hủy yêu cầu
                </Button>
              </div>
            </div>
          )}

          {status === 'issued' && existingVatNumber && (
            <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/20">
              <div className="text-xs text-muted-foreground">Số HĐVAT đã xuất</div>
              <div className="font-mono text-base font-semibold text-green-700 dark:text-green-400">
                {existingVatNumber}
              </div>
            </div>
          )}

          {status === 'cancelled' && (
            <div className="text-xs text-muted-foreground italic text-center py-2">
              Yêu cầu đã bị hủy.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
