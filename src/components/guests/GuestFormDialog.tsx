import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCreateGuest, useUpdateGuest, type Guest } from '@/hooks/useGuests'
import { useTenant } from '@/hooks/useTenant'

const VIP_LEVELS = [
  { value: 'normal', label: 'Thường' },
  { value: 'silver', label: 'Bạc' },
  { value: 'gold', label: 'Vàng' },
  { value: 'vip', label: 'VIP' },
  { value: 'platinum', label: 'Bạch kim' },
  { value: 'blacklist', label: 'Blacklist' },
]

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  guest?: Guest | null
}

export function GuestFormDialog({ open, onOpenChange, guest }: Props) {
  const { tenant } = useTenant()
  const create = useCreateGuest()
  const update = useUpdateGuest()
  const isEdit = !!guest

  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', vip_level: 'normal',
    gender: '', date_of_birth: '', nationality: 'VN', address: '',
    id_type: 'cccd', id_number: '', notes: '',
  })

  useEffect(() => {
    if (open) {
      setForm({
        full_name: guest?.full_name || '',
        phone: guest?.phone || '',
        email: guest?.email || '',
        vip_level: guest?.vip_level || 'normal',
        gender: guest?.gender || '',
        date_of_birth: guest?.date_of_birth || '',
        nationality: guest?.nationality || 'VN',
        address: guest?.address || '',
        id_type: guest?.id_type || 'cccd',
        id_number: guest?.id_number || '',
        notes: guest?.notes || '',
      })
    }
  }, [open, guest])

  const handleSave = async () => {
    if (!form.full_name.trim()) return
    if (isEdit && guest) {
      await update.mutateAsync({ id: guest.id, ...form } as any)
      toast.success('Đã cập nhật thông tin khách')
    } else if (tenant?.id) {
      await create.mutateAsync({
        tenant_id: tenant.id,
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        vip_level: form.vip_level,
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
        nationality: form.nationality || null,
        address: form.address || null,
        id_type: form.id_type || null,
        id_number: form.id_number.trim() || null,
        notes: form.notes || null,
        id_image_url: null,
      } as any)
      toast.success('Đã thêm khách mới')
    }
    onOpenChange(false)
  }

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))
  const busy = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Sửa khách hàng' : 'Thêm khách hàng'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Họ tên *</Label>
            <Input className="h-8" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">SĐT</Label>
            <Input className="h-8 font-mono" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input className="h-8" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hạng khách</Label>
            <Select value={form.vip_level} onValueChange={(v) => set('vip_level', v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VIP_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Giới tính</Label>
            <Select value={form.gender || 'unset'} onValueChange={(v) => set('gender', v === 'unset' ? '' : v)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">—</SelectItem>
                <SelectItem value="male">Nam</SelectItem>
                <SelectItem value="female">Nữ</SelectItem>
                <SelectItem value="other">Khác</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ngày sinh</Label>
            <Input type="date" className="h-8" max={new Date().toISOString().split('T')[0]} value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Quốc tịch</Label>
            <Input className="h-8" value={form.nationality} onChange={(e) => set('nationality', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Loại giấy tờ</Label>
            <Select value={form.id_type} onValueChange={(v) => set('id_type', v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cccd">CCCD</SelectItem>
                <SelectItem value="cmnd">CMND</SelectItem>
                <SelectItem value="passport">Hộ chiếu</SelectItem>
                <SelectItem value="other">Khác</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Số giấy tờ</Label>
            <Input className="h-8 font-mono" value={form.id_number} onChange={(e) => set('id_number', e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Địa chỉ</Label>
            <Input className="h-8" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Ghi chú</Label>
            <Input className="h-8" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button type="button" onClick={handleSave} disabled={busy || !form.full_name.trim()}>
            {busy ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
