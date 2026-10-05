import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, Plus } from 'lucide-react'
import { useCreateGuestInvoice, InvoiceLineItem } from '@/hooks/useGuestInvoices'
import { useTenant } from '@/hooks/useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useUser } from '@/hooks/useUser'
import { formatCurrency } from '@/lib/utils'

interface CreateInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefill?: {
    booking_id?: string
    guest_name?: string
    guest_phone?: string
    guest_address?: string
    room_number?: string
    check_in_date?: string
    check_out_date?: string
    line_items?: InvoiceLineItem[]
    deposit_amount?: number
    amount_paid?: number
    payment_method?: string
  }
}

const DEFAULT_LINE_ITEM: InvoiceLineItem = { description: '', quantity: 1, unit_price: 0, amount: 0 }

export default function CreateInvoiceDialog({ open, onOpenChange, prefill }: CreateInvoiceDialogProps) {
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  const { user } = useUser()
  const createInvoice = useCreateGuestInvoice()

  const [form, setForm] = useState(() => ({
    guest_name: prefill?.guest_name || '',
    guest_phone: prefill?.guest_phone || '',
    guest_address: prefill?.guest_address || '',
    guest_tax_code: '',
    company_name: '',
    room_number: prefill?.room_number || '',
    check_in_date: prefill?.check_in_date || '',
    check_out_date: prefill?.check_out_date || '',
    line_items: prefill?.line_items?.length ? prefill.line_items : [{ ...DEFAULT_LINE_ITEM }],
    vat_rate: 8, // integer percent (8 = 8%)
    service_fee_rate: 5, // integer percent
    deposit_amount: prefill?.deposit_amount || 0,
    amount_paid: prefill?.amount_paid || 0,
    payment_method: prefill?.payment_method || 'cash',
    notes: '',
  }))

  const subtotal = form.line_items.reduce((sum, item) => sum + item.amount, 0)
  const vatAmount = Math.round(subtotal * form.vat_rate / 100)
  const serviceFeeAmount = Math.round(subtotal * form.service_fee_rate / 100)
  const totalAmount = subtotal + vatAmount + serviceFeeAmount

  const updateLineItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    setForm(prev => {
      const items = [...prev.line_items]
      items[index] = { ...items[index], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        items[index].amount = items[index].quantity * items[index].unit_price
      }
      return { ...prev, line_items: items }
    })
  }

  const addLineItem = () => {
    setForm(prev => ({ ...prev, line_items: [...prev.line_items, { ...DEFAULT_LINE_ITEM }] }))
  }

  const removeLineItem = (index: number) => {
    if (form.line_items.length <= 1) return
    setForm(prev => ({ ...prev, line_items: prev.line_items.filter((_, i) => i !== index) }))
  }

  const handleSubmit = async () => {
    if (!tenant?.id || !selectedHotel?.id || !form.guest_name.trim()) return
    await createInvoice.mutateAsync({
      tenant_id: tenant.id,
      hotel_id: selectedHotel.id,
      booking_id: prefill?.booking_id || null,
      guest_name: form.guest_name.trim(),
      guest_phone: form.guest_phone || null,
      guest_address: form.guest_address || null,
      guest_tax_code: form.guest_tax_code || null,
      company_name: form.company_name || null,
      room_number: form.room_number || null,
      check_in_date: form.check_in_date || null,
      check_out_date: form.check_out_date || null,
      line_items: form.line_items,
      subtotal,
      vat_rate: form.vat_rate,
      vat_amount: vatAmount,
      service_fee_rate: form.service_fee_rate,
      service_fee_amount: serviceFeeAmount,
      total_amount: totalAmount,
      deposit_amount: form.deposit_amount,
      amount_paid: form.amount_paid,
      payment_method: form.payment_method || null,
      notes: form.notes || null,
      status: 'draft',
      created_by: user?.id || null,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Tạo hóa đơn</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Guest Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tên khách *</Label>
              <Input className="h-8" value={form.guest_name} onChange={e => setForm(p => ({ ...p, guest_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">SĐT</Label>
              <Input className="h-8" value={form.guest_phone} onChange={e => setForm(p => ({ ...p, guest_phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">MST (nếu xuất VAT)</Label>
              <Input className="h-8" value={form.guest_tax_code} onChange={e => setForm(p => ({ ...p, guest_tax_code: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tên công ty</Label>
              <Input className="h-8" value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Địa chỉ</Label>
              <Input className="h-8" value={form.guest_address} onChange={e => setForm(p => ({ ...p, guest_address: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phòng</Label>
              <Input className="h-8" value={form.room_number} onChange={e => setForm(p => ({ ...p, room_number: e.target.value }))} />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Chi tiết</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addLineItem}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Thêm dòng
              </Button>
            </div>
            <div className="space-y-2">
              {form.line_items.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_90px_90px_28px] gap-1.5 items-end">
                  {i === 0 && <>
                    <Label className="text-[10px] text-muted-foreground">Nội dung</Label>
                    <Label className="text-[10px] text-muted-foreground">SL</Label>
                    <Label className="text-[10px] text-muted-foreground">Đơn giá</Label>
                    <Label className="text-[10px] text-muted-foreground">Thành tiền</Label>
                    <div />
                  </>}
                  <Input className="h-8 text-xs" value={item.description} onChange={e => updateLineItem(i, 'description', e.target.value)} placeholder="Mô tả..." />
                  <Input className="h-8 text-xs text-center" type="number" min={1} value={item.quantity} onChange={e => updateLineItem(i, 'quantity', Number(e.target.value))} />
                  <Input className="h-8 text-xs font-mono" type="number" min={0} value={item.unit_price} onChange={e => updateLineItem(i, 'unit_price', Number(e.target.value))} />
                  <div className="h-8 flex items-center text-xs font-mono">{formatCurrency(item.amount)}</div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLineItem(i)} disabled={form.line_items.length <= 1}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tạm tính</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">VAT</span>
                <Input className="h-6 w-14 text-xs text-center" type="number" min={0} value={form.vat_rate} onChange={e => setForm(p => ({ ...p, vat_rate: Number(e.target.value) }))} />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <span className="font-mono">{formatCurrency(vatAmount)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Phí DV</span>
                <Input className="h-6 w-14 text-xs text-center" type="number" min={0} value={form.service_fee_rate} onChange={e => setForm(p => ({ ...p, service_fee_rate: Number(e.target.value) }))} />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <span className="font-mono">{formatCurrency(serviceFeeAmount)}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-1.5">
              <span>Tổng cộng</span>
              <span className="font-mono">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Đã cọc</span>
              <Input className="h-7 w-28 text-xs font-mono text-right" type="number" min={0} value={form.deposit_amount} onChange={e => setForm(p => ({ ...p, deposit_amount: Number(e.target.value) }))} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Đã thanh toán</span>
              <Input className="h-7 w-28 text-xs font-mono text-right" type="number" min={0} value={form.amount_paid} onChange={e => setForm(p => ({ ...p, amount_paid: Number(e.target.value) }))} />
            </div>
            {totalAmount - form.amount_paid > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Còn lại</span>
                <span className="font-mono">{formatCurrency(totalAmount - form.amount_paid)}</span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Ghi chú</Label>
            <Input className="h-8" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="button" size="sm" className="h-8" onClick={handleSubmit} disabled={!form.guest_name.trim() || createInvoice.isPending}>
              Tạo hóa đơn
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
