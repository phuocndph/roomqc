// Dialog quản lý gói giá cho 1 hạng phòng — port từ RatePlanManagerByRoom
import { useState, useEffect } from 'react'
import { useSaveRatePlans, useRatePlans } from '@/hooks/usePricingDaily'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Trash2, GripVertical, Save } from 'lucide-react'
import { toast } from 'sonner'
import { INCLUSION_LABELS, POLICY_LABELS } from '@/lib/pricing/rate-plan-constants'

interface PlanDraft {
  id?: string
  name: string
  price: number | null
  sale_price: number | null
  inclusions: string[]
  policies: string[]
  is_active: boolean
}

const INCLUSION_OPTIONS = Object.entries(INCLUSION_LABELS).map(([value, meta]) => ({ value, label: meta.label }))
const POLICY_OPTIONS = Object.entries(POLICY_LABELS).map(([value, meta]) => ({ value, label: meta.label }))

const formatPriceInput = (value: number | null) => value == null || Number.isNaN(value) ? '' : new Intl.NumberFormat('vi-VN').format(value)
const parsePriceInput = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits ? Number(digits) : null
}

interface Props {
  roomTypeId: string
  roomTypeName: string
  hotelId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export default function RatePlanManager({ roomTypeId, roomTypeName, hotelId, open, onOpenChange, onSaved }: Props) {
  const { data: existing, isLoading } = useRatePlans(open ? roomTypeId : null)
  const save = useSaveRatePlans()
  const [plans, setPlans] = useState<PlanDraft[]>([])

  useEffect(() => {
    if (open && existing) {
      setPlans(existing.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        sale_price: p.sale_price,
        inclusions: p.inclusions || [],
        policies: p.policies || [],
        is_active: p.is_active,
      })))
    }
  }, [open, existing])

  const addPlan = () => setPlans([...plans, {
    name: '', price: null, sale_price: null, inclusions: [], policies: [], is_active: true,
  }])

  const removePlan = (i: number) => setPlans(plans.filter((_, idx) => idx !== i))
  const updatePlan = (i: number, field: keyof PlanDraft, value: any) => {
    const next = [...plans]
    ;(next[i] as any)[field] = value
    setPlans(next)
  }
  const toggle = (i: number, field: 'inclusions' | 'policies', value: string) => {
    const cur = plans[i][field]
    updatePlan(i, field, cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value])
  }

  const handleSave = async () => {
    const valid = plans.filter(p => p.name.trim() && p.price && p.price > 0)
    if (valid.length !== plans.length) {
      toast.error('Gói giá phải có tên và giá > 0')
      return
    }
    try {
      await save.mutateAsync({
        roomTypeId,
        hotelId,
        plans: valid.map(p => ({
          name: p.name.trim(),
          price: p.price as number,
          sale_price: p.sale_price,
          inclusions: p.inclusions,
          policies: p.policies,
          is_active: p.is_active,
        })),
      })
      onSaved?.()
      onOpenChange(false)
    } catch { /* toast in hook */ }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Gói giá — {roomTypeName}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Đang tải...</p>
        ) : (
          <div className="space-y-4">
            {plans.length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-6 border border-dashed rounded-lg">
                Chưa có gói giá. Nhấn "Thêm gói" để bắt đầu.
              </p>
            )}

            {plans.map((plan, index) => (
              <div key={index} className="rounded-lg border p-3 space-y-3 bg-muted/20">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    className="h-8 text-sm flex-1"
                    value={plan.name}
                    onChange={(e) => updatePlan(index, 'name', e.target.value)}
                    placeholder="Tên gói (VD: Standard, Bao bữa sáng)"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removePlan(index)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Giá/đêm mặc định (VNĐ) *</label>
                    <Input
                      className="h-8 text-sm" type="text" inputMode="numeric"
                      value={formatPriceInput(plan.price)}
                      onChange={(e) => updatePlan(index, 'price', parsePriceInput(e.target.value))}
                      placeholder="1.500.000"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Giá KM mặc định</label>
                    <Input
                      className="h-8 text-sm" type="text" inputMode="numeric"
                      value={formatPriceInput(plan.sale_price)}
                      onChange={(e) => updatePlan(index, 'sale_price', parsePriceInput(e.target.value))}
                      placeholder="Không có"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Giá theo từng ngày được thiết lập riêng ở lưới bên dưới.
                </p>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Dịch vụ kèm theo</label>
                  <div className="flex flex-wrap gap-2">
                    {INCLUSION_OPTIONS.map(opt => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Checkbox
                          checked={plan.inclusions.includes(opt.value)}
                          onCheckedChange={() => toggle(index, 'inclusions', opt.value)}
                          className="h-3.5 w-3.5"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Chính sách</label>
                  <div className="flex flex-wrap gap-2">
                    {POLICY_OPTIONS.map(opt => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Checkbox
                          checked={plan.policies.includes(opt.value)}
                          onCheckedChange={() => toggle(index, 'policies', opt.value)}
                          className="h-3.5 w-3.5"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <Button type="button" variant="outline" size="sm" onClick={addPlan}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Thêm gói
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={save.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" />
                {save.isPending ? 'Đang lưu...' : 'Lưu gói giá'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
