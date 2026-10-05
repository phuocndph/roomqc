import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useVendors } from '@/hooks/useVendors'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemId: string | null
  itemName?: string
}

interface ItemReorderSettings {
  reorder_point: number | null
  reorder_max_qty: number | null
  lead_time_days: number | null
  is_perishable: boolean | null
  preferred_vendor_id: string | null
  auto_reorder_enabled: boolean | null
  safety_factor: number | null
}

const NO_VENDOR = '__none__'

export function ReorderSettingsDialog({ open, onOpenChange, itemId, itemName }: Props) {
  const { tenantId } = useUser()
  const { data: vendors = [] } = useVendors()
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ItemReorderSettings>({
    reorder_point: 0,
    reorder_max_qty: null,
    lead_time_days: 7,
    is_perishable: false,
    preferred_vendor_id: null,
    auto_reorder_enabled: false,
    safety_factor: 1.3,
  })

  useEffect(() => {
    if (!open || !itemId || !tenantId) return
    setLoading(true)
    supabase
      .from('items')
      .select('reorder_point, reorder_max_qty, lead_time_days, is_perishable, preferred_vendor_id, auto_reorder_enabled, safety_factor')
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          toast.error('Không tải được cài đặt')
        } else if (data) {
          setForm({
            reorder_point: data.reorder_point ?? 0,
            reorder_max_qty: (data as any).reorder_max_qty ?? null,
            lead_time_days: (data as any).lead_time_days ?? 7,
            is_perishable: (data as any).is_perishable ?? false,
            preferred_vendor_id: (data as any).preferred_vendor_id ?? null,
            auto_reorder_enabled: (data as any).auto_reorder_enabled ?? false,
            safety_factor: (data as any).safety_factor ?? 1.3,
          })
        }
        setLoading(false)
      })
  }, [open, itemId, tenantId])

  const handleSave = async () => {
    if (!itemId || !tenantId) return
    setSaving(true)
    const { error } = await supabase
      .from('items')
      .update({
        reorder_point: form.reorder_point ?? 0,
        reorder_max_qty: form.reorder_max_qty,
        lead_time_days: form.lead_time_days ?? 7,
        is_perishable: form.is_perishable ?? false,
        preferred_vendor_id: form.preferred_vendor_id,
        auto_reorder_enabled: form.auto_reorder_enabled ?? false,
        safety_factor: form.safety_factor ?? 1.3,
      } as any)
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
    setSaving(false)
    if (error) {
      toast.error('Lưu thất bại: ' + error.message)
    } else {
      toast.success('Đã lưu cài đặt nhập hàng')
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['reorder-suggestions'] })
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cài đặt nhập hàng</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {itemName && (
            <div className="text-sm text-muted-foreground">
              Item: <span className="font-medium text-foreground">{itemName}</span>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Đang tải...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="rp" className="text-xs">Mức tối thiểu *</Label>
                  <Input
                    id="rp"
                    type="number"
                    min={0}
                    value={form.reorder_point ?? 0}
                    onChange={(e) => setForm({ ...form, reorder_point: parseInt(e.target.value || '0', 10) })}
                    className="h-9"
                  />
                  <p className="text-[10px] text-muted-foreground">Tồn xuống dưới mức này → đề xuất nhập</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rm" className="text-xs">Mức tối đa</Label>
                  <Input
                    id="rm"
                    type="number"
                    min={0}
                    value={form.reorder_max_qty ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        reorder_max_qty: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                    className="h-9"
                    placeholder="Mặc định = tối thiểu × 2"
                  />
                  <p className="text-[10px] text-muted-foreground">Mục tiêu sau khi nhập</p>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="lt" className="text-xs">Số ngày chờ giao</Label>
                <Input
                  id="lt"
                  type="number"
                  min={1}
                  max={90}
                  value={form.lead_time_days ?? 7}
                  onChange={(e) =>
                    setForm({ ...form, lead_time_days: parseInt(e.target.value || '7', 10) })
                  }
                  className="h-9"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="vendor" className="text-xs">Nhà cung cấp ưu tiên</Label>
                <Select
                  value={form.preferred_vendor_id ?? NO_VENDOR}
                  onValueChange={(v) =>
                    setForm({ ...form, preferred_vendor_id: v === NO_VENDOR ? null : v })
                  }
                >
                  <SelectTrigger id="vendor" className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VENDOR}>— Chưa gán —</SelectItem>
                    {vendors.map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Khi duyệt đề xuất, các item cùng vendor sẽ gom thành 1 PO
                </p>
              </div>

              <div className="flex items-center justify-between border rounded-lg p-2">
                <div>
                  <Label htmlFor="perish" className="text-sm">Hàng dễ hư hỏng</Label>
                  <p className="text-[10px] text-muted-foreground">Cảnh báo khi sắp hết hạn</p>
                </div>
                <Switch
                  id="perish"
                  checked={form.is_perishable ?? false}
                  onCheckedChange={(v) => setForm({ ...form, is_perishable: v })}
                />
              </div>

              <div className="border rounded-lg p-2 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="auto" className="text-sm">Tự động gợi ý đặt hàng</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Dự đoán theo tiêu thụ TB × ngày chờ × hệ số an toàn
                    </p>
                  </div>
                  <Switch
                    id="auto"
                    checked={form.auto_reorder_enabled ?? false}
                    onCheckedChange={(v) => setForm({ ...form, auto_reorder_enabled: v })}
                  />
                </div>
                {form.auto_reorder_enabled && (
                  <div className="space-y-1">
                    <Label htmlFor="sf" className="text-xs">Hệ số an toàn</Label>
                    <Input
                      id="sf"
                      type="number"
                      step="0.1"
                      min={1}
                      max={3}
                      value={form.safety_factor ?? 1.3}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          safety_factor: parseFloat(e.target.value || '1.3'),
                        })
                      }
                      className="h-8"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Mặc định 1.3 (dư 30% phòng đột biến)
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
