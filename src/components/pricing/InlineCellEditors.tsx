// Inline editors — popover sửa nhanh 1 ô, adapt sang rate_plan_daily_prices + room_type_availability
import { useEffect, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, Lock, Unlock, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { toDateKey } from '@/lib/pricing/rate-plan-constants'
import { useUser } from '@/hooks/useUser'
import { VIRTUAL_DEFAULT_PLAN_ID, ensureDefaultRatePlan } from '@/hooks/usePricingDaily'

export function InlinePriceEditor({
  open, onOpenChange, children,
  ratePlanId, planName, basePrice, date, roomTypeId,
  initialPrice, initialSalePrice, initialIsClosed, hasOverride,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  children: React.ReactNode
  ratePlanId: string
  /** Bắt buộc khi ratePlanId là gói chuẩn ảo, để materialize */
  roomTypeId?: string
  planName: string
  basePrice: number
  date: Date
  initialPrice: number | null
  initialSalePrice: number | null
  initialIsClosed: boolean
  hasOverride: boolean
  onSaved: () => void
}) {
  const { tenantId } = useUser()
  const [price, setPrice] = useState<string>('')
  const [salePrice, setSalePrice] = useState<string>('')
  const [isClosed, setIsClosed] = useState(false)
  const [saving, setSaving] = useState(false)

  const formatNum = (raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return ''
    return Number(digits).toLocaleString('vi-VN')
  }
  const parseNum = (formatted: string): number | null => {
    const digits = formatted.replace(/\D/g, '')
    return digits === '' ? null : Number(digits)
  }

  useEffect(() => {
    if (open) {
      setPrice(initialPrice != null ? Number(initialPrice).toLocaleString('vi-VN') : Number(basePrice).toLocaleString('vi-VN'))
      setSalePrice(initialSalePrice != null ? Number(initialSalePrice).toLocaleString('vi-VN') : '')
      setIsClosed(initialIsClosed)
    }
  }, [open, initialPrice, initialSalePrice, initialIsClosed, basePrice])

  const handleSave = async () => {
    if (!tenantId) return
    setSaving(true)
    const dateKey = toDateKey(date)
    const priceNum = parseNum(price)
    const saleNum = parseNum(salePrice)

    if (priceNum != null && (isNaN(priceNum) || priceNum < 0)) { toast.error('Giá không hợp lệ'); setSaving(false); return }
    if (saleNum != null && (isNaN(saleNum) || saleNum < 0)) { toast.error('Giá KM không hợp lệ'); setSaving(false); return }

    let realPlanId = ratePlanId
    if (ratePlanId === VIRTUAL_DEFAULT_PLAN_ID) {
      if (!roomTypeId) { toast.error('Thiếu hạng phòng'); setSaving(false); return }
      try {
        realPlanId = await ensureDefaultRatePlan(roomTypeId)
      } catch (e: any) {
        toast.error('Không tạo được gói chuẩn: ' + (e?.message || ''))
        setSaving(false); return
      }
    }

    const { error } = await supabase
      .from('rate_plan_daily_prices' as any)
      .upsert(
        { tenant_id: tenantId, rate_plan_id: realPlanId, date: dateKey, price: priceNum, sale_price: saleNum, is_closed: isClosed } as any,
        { onConflict: 'rate_plan_id,date' },
      )

    setSaving(false)
    if (error) { toast.error('Lưu thất bại: ' + error.message); return }
    toast.success('Đã cập nhật')
    onOpenChange(false)
    onSaved()
  }

  const handleReset = async () => {
    setSaving(true)
    const dateKey = toDateKey(date)
    const { error } = await supabase
      .from('rate_plan_daily_prices' as any)
      .delete()
      .eq('rate_plan_id', ratePlanId)
      .eq('date', dateKey)
    setSaving(false)
    if (error) { toast.error('Xóa thất bại: ' + error.message); return }
    toast.success('Đã reset về giá mặc định')
    onOpenChange(false)
    onSaved()
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="center" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold">{planName}</p>
            <p className="text-[11px] text-muted-foreground">{format(date, 'EEEE, d/M/yyyy', { locale: vi })}</p>
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
            <Label htmlFor="closed-toggle" className="text-xs flex items-center gap-1.5 cursor-pointer">
              {isClosed ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3 text-emerald-600" />}
              Đóng bán ngày này
            </Label>
            <Switch id="closed-toggle" checked={isClosed} onCheckedChange={setIsClosed} />
          </div>

          {!isClosed && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Giá (VND) — mặc định {basePrice.toLocaleString('vi-VN')}đ</Label>
                <Input
                  type="text" inputMode="numeric"
                  value={price}
                  onChange={(e) => setPrice(formatNum(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-8 text-sm tabular-nums"
                  placeholder={Number(basePrice).toLocaleString('vi-VN')}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Giá KM (tùy chọn)</Label>
                <Input
                  type="text" inputMode="numeric"
                  value={salePrice}
                  onChange={(e) => setSalePrice(formatNum(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-8 text-sm tabular-nums"
                  placeholder="Để trống nếu không KM"
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2 pt-1">
            {hasOverride && (
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={handleReset} disabled={saving}>
                <Trash2 className="h-3 w-3 mr-1" /> Reset
              </Button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)} disabled={saving}>Hủy</Button>
            <Button type="button" size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Lưu'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function InlineAvailabilityEditor({
  open, onOpenChange, children,
  roomTypeId, hotelId, defaultQty, date,
  initialQty, initialIsClosed,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  children: React.ReactNode
  roomTypeId: string
  hotelId: string | null
  defaultQty: number
  date: Date
  initialQty: number
  initialIsClosed: boolean
  onSaved: () => void
}) {
  const { tenantId } = useUser()
  const [qty, setQty] = useState<string>('')
  const [isClosed, setIsClosed] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setQty(String(initialQty))
      setIsClosed(initialIsClosed)
    }
  }, [open, initialQty, initialIsClosed])

  const handleSave = async () => {
    if (!tenantId) return
    setSaving(true)
    const dateKey = toDateKey(date)
    const qtyNum = Math.max(0, Math.floor(Number(qty) || 0))

    const { error } = await supabase
      .from('room_type_availability' as any)
      .upsert(
        { tenant_id: tenantId, hotel_id: hotelId, room_type_id: roomTypeId, date: dateKey, available_qty: qtyNum, is_closed: isClosed } as any,
        { onConflict: 'room_type_id,date' },
      )
    setSaving(false)
    if (error) { toast.error('Lưu thất bại: ' + error.message); return }
    toast.success('Đã cập nhật')
    onOpenChange(false)
    onSaved()
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="center" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold">Tình trạng phòng</p>
            <p className="text-[11px] text-muted-foreground">{format(date, 'EEEE, d/M/yyyy', { locale: vi })}</p>
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
            <Label htmlFor="av-closed" className="text-xs flex items-center gap-1.5 cursor-pointer">
              {isClosed ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3 text-emerald-600" />}
              Đóng bán ngày này
            </Label>
            <Switch id="av-closed" checked={isClosed} onCheckedChange={setIsClosed} />
          </div>

          {!isClosed && (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Số phòng để bán (tối đa {defaultQty})</Label>
              <Input
                type="number" inputMode="numeric"
                min={0} max={defaultQty}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)} disabled={saving}>Hủy</Button>
            <Button type="button" size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Lưu'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
