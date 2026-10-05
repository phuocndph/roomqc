import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2, Plus, Pencil } from 'lucide-react'
import { useHotelContext } from '@/contexts/HotelContext'
import { useRoomTypes } from '@/hooks/useRoomTypes'
import {
  useSeasonalRates, useUpsertSeasonalRate, useDeleteSeasonalRate,
  type SeasonalRateOverride, type SeasonalApplyTo,
} from '@/hooks/useSeasonalRates'
import { formatCurrency } from '@/lib/utils'


// Quy tắc mùa CHỈ áp lên Giá đêm. Giá giờ & Giá tháng cố định ở bảng giá mặc định.
const APPLY_TO_OPTIONS: { value: SeasonalApplyTo; label: string }[] = [
  { value: 'daily', label: 'Giá đêm' },
]

interface FormState {
  id?: string
  name: string
  from_date: string
  to_date: string
  hotel_id: string | null
  room_type_ids: string[]
  apply_to: SeasonalApplyTo[]
  mode: 'add_on' | 'overwrite'
  adjust_type: 'percent' | 'fixed_amount' | 'set_rate'
  adjust_value: number
  priority: number
  active: boolean
}

const emptyForm = (): FormState => ({
  name: '',
  from_date: new Date().toISOString().slice(0, 10),
  to_date: new Date().toISOString().slice(0, 10),
  hotel_id: null,
  room_type_ids: [],
  apply_to: ['daily'],
  mode: 'overwrite',
  adjust_type: 'set_rate',
  adjust_value: 0,
  priority: 100,
  active: true,
})

export default function SeasonalRulesPage() {
  const { selectedHotel } = useHotelContext()
  const { data: rules = [], isLoading } = useSeasonalRates(selectedHotel?.id)
  const upsert = useUpsertSeasonalRate()
  const remove = useDeleteSeasonalRate()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())

  const { data: roomTypes = [] } = useRoomTypes()


  const openCreate = () => { setForm({ ...emptyForm(), hotel_id: selectedHotel?.id ?? null }); setOpen(true) }
  const openEdit = (r: SeasonalRateOverride) => {
    setForm({
      id: r.id, name: r.name, from_date: r.from_date, to_date: r.to_date,
      hotel_id: r.hotel_id, room_type_ids: r.room_type_ids ?? [],
      apply_to: r.apply_to ?? [], mode: r.mode, adjust_type: r.adjust_type,
      adjust_value: Number(r.adjust_value), priority: r.priority, active: r.active,
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) return
    await upsert.mutateAsync(form as any)
    setOpen(false)
  }

  const adjustLabel = (r: SeasonalRateOverride) => {
    if (r.adjust_type === 'percent') return `${r.adjust_value > 0 ? '+' : ''}${r.adjust_value}%`
    if (r.adjust_type === 'fixed_amount') return `${r.adjust_value > 0 ? '+' : ''}${formatCurrency(r.adjust_value)}`
    return `= ${formatCurrency(r.adjust_value)}`
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Quy tắc mùa giá</h1>
          <p className="text-xs text-muted-foreground">Tăng/giảm giá theo mùa lễ, cuối tuần, sự kiện</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Thêm quy tắc</Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2 font-medium">Tên</th>
              <th className="p-2 font-medium">Thời gian</th>
              <th className="p-2 font-medium">Loại đặt</th>
              <th className="p-2 font-medium">Chế độ</th>
              <th className="p-2 font-medium">Điều chỉnh</th>
              <th className="p-2 font-medium text-center">Ưu tiên</th>
              <th className="p-2 font-medium text-center">Trạng thái</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Đang tải...</td></tr>}
            {!isLoading && rules.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Chưa có quy tắc nào</td></tr>
            )}
            {rules.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-medium">{r.name}</td>
                <td className="p-2 font-mono text-xs">{r.from_date} → {r.to_date}</td>
                <td className="p-2 text-xs">{(r.apply_to ?? []).map(a => APPLY_TO_OPTIONS.find(o => o.value === a)?.label).join(', ')}</td>
                <td className="p-2 text-xs">{r.mode === 'add_on' ? 'Cộng thêm' : 'Ghi đè'}</td>
                <td className="p-2 font-mono">{adjustLabel(r)}</td>
                <td className="p-2 text-center">{r.priority}</td>
                <td className="p-2 text-center">
                  {r.active ? <span className="text-green-600 text-xs">Bật</span> : <span className="text-muted-foreground text-xs">Tắt</span>}
                </td>
                <td className="p-2 text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                    onClick={() => confirm(`Xóa quy tắc "${r.name}"?`) && remove.mutate(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Sửa quy tắc' : 'Thêm quy tắc mùa giá'}</DialogTitle>
          </DialogHeader>
          {(() => {
            const conflicts = rules.filter(r => {
              if (form.id && r.id === form.id) return false
              if (!r.active) return false
              if (r.from_date > form.to_date || r.to_date < form.from_date) return false
              const sharedApply = (r.apply_to ?? []).some(a => form.apply_to.includes(a))
              if (!sharedApply) return false
              const aRT = r.room_type_ids ?? []
              const bRT = form.room_type_ids
              const sharedRT = aRT.length === 0 || bRT.length === 0 || aRT.some(x => bRT.includes(x))
              if (!sharedRT) return false
              return r.priority === form.priority
            })
            if (conflicts.length === 0) return null
            return (
              <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded p-2 text-xs">
                <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                  ⚠ Trùng ưu tiên với {conflicts.length} quy tắc:
                </div>
                <ul className="list-disc list-inside text-amber-800 dark:text-amber-300">
                  {conflicts.slice(0, 3).map(c => (
                    <li key={c.id}>{c.name} (ưu tiên {c.priority}, {c.from_date}→{c.to_date})</li>
                  ))}
                </ul>
                <div className="mt-1 text-amber-700">Đổi số ưu tiên khác để xác định thứ tự áp dụng.</div>
              </div>
            )
          })()}

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tên quy tắc *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Tết 2026, Cuối tuần, Hè cao điểm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Từ ngày *</Label>
                <Input type="date" value={form.from_date} onChange={e => setForm({ ...form, from_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Đến ngày *</Label>
                <Input type="date" value={form.to_date} onChange={e => setForm({ ...form, to_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Áp dụng cho loại đặt</Label>
              <div className="flex flex-wrap gap-3 mt-1">
                {APPLY_TO_OPTIONS.map(o => (
                  <label key={o.value} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={form.apply_to.includes(o.value)}
                      onCheckedChange={(c) => setForm({
                        ...form, apply_to: c ? [...form.apply_to, o.value] : form.apply_to.filter(x => x !== o.value),
                      })} />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Loại phòng (để trống = áp dụng tất cả)</Label>
              <div className="flex flex-wrap gap-3 mt-1 max-h-32 overflow-y-auto border rounded p-2">
                {roomTypes.map((rt: any) => (
                  <label key={rt.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={form.room_type_ids.includes(rt.id)}
                      onCheckedChange={(c) => setForm({
                        ...form,
                        room_type_ids: c ? [...form.room_type_ids, rt.id] : form.room_type_ids.filter(x => x !== rt.id),
                      })} />
                    {rt.name}
                  </label>
                ))}
                {roomTypes.length === 0 && <span className="text-xs text-muted-foreground">Chưa có loại phòng</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Chế độ</Label>
                <Select
                  value={form.mode}
                  onValueChange={(v: any) => setForm({ ...form, mode: v })}
                  disabled={form.adjust_type === 'set_rate'}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add_on">Cộng thêm (stack)</SelectItem>
                    <SelectItem value="overwrite">Ghi đè (cao nhất thắng)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Kiểu điều chỉnh</Label>
                <Select
                  value={form.adjust_type}
                  onValueChange={(v: any) => setForm({
                    ...form,
                    adjust_type: v,
                    // Đặt giá tuyệt đối luôn đi với "Ghi đè"
                    mode: v === 'set_rate' ? 'overwrite' : form.mode,
                  })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set_rate">Đặt giá mùa (₫) — khuyên dùng</SelectItem>
                    <SelectItem value="percent">Phần trăm (%)</SelectItem>
                    <SelectItem value="fixed_amount">Số tiền cộng/trừ (₫)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">
                  {form.adjust_type === 'set_rate'
                    ? 'Giá mùa cho mỗi đêm (₫)'
                    : form.adjust_type === 'percent'
                      ? 'Phần trăm (âm = giảm)'
                      : 'Số tiền (âm = giảm)'}
                </Label>
                <Input type="number" min={0} value={form.adjust_value}
                  onChange={e => setForm({ ...form, adjust_value: Number(e.target.value) })} />
                {form.adjust_type === 'set_rate' && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    VD: nhập 2.500.000 → giá phòng trong khoảng ngày này sẽ là 2.500.000 ₫/đêm, bất kể giá mặc định.
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Ưu tiên (số nhỏ = áp trước)</Label>
                <Input type="number" min={0} value={form.priority}
                  onChange={e => setForm({ ...form, priority: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <Label className="text-sm">Kích hoạt</Label>
              <Switch checked={form.active} onCheckedChange={(c) => setForm({ ...form, active: c })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
            <Button onClick={save} disabled={upsert.isPending}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
