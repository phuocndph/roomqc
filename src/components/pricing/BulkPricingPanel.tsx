// Bulk pricing panel — port adapt từ Deal Hotel Hub
import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { toDateKey } from '@/lib/pricing/rate-plan-constants'
import { useUser } from '@/hooks/useUser'
import { VIRTUAL_DEFAULT_PLAN_ID, ensureDefaultRatePlan } from '@/hooks/usePricingDaily'

interface RatePlan { id: string; name: string; price: number }

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  roomTypeId: string
  roomTypeName: string
  hotelId: string | null
  ratePlans: RatePlan[]
  initialFrom: Date
  initialTo: Date
  defaultQty: number
  onSaved?: () => void
}

const WEEKDAYS = [
  { value: 1, label: 'T2' }, { value: 2, label: 'T3' }, { value: 3, label: 'T4' },
  { value: 4, label: 'T5' }, { value: 5, label: 'T6' }, { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
]

function DateField({ value, onChange, label }: { value: Date; onChange: (d: Date) => void; label: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full h-9 justify-between text-sm font-normal">
            {format(value, 'yyyy-MM-dd', { locale: vi })}
            <CalendarIcon className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value} onSelect={(d) => d && onChange(d)} initialFocus className={cn('p-3 pointer-events-auto')} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function eachDayInRange(from: Date, to: Date, weekdays: Set<number>): Date[] {
  const days: Date[] = []
  const cur = new Date(from); cur.setHours(0,0,0,0)
  const end = new Date(to); end.setHours(0,0,0,0)
  while (cur <= end) {
    if (weekdays.has(cur.getDay())) days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

export default function BulkPricingPanel({
  open, onOpenChange, roomTypeId, roomTypeName, hotelId, ratePlans, initialFrom, initialTo, defaultQty, onSaved,
}: Props) {
  const { tenantId } = useUser()
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([0,1,2,3,4,5,6]))

  const [qtyValue, setQtyValue] = useState('')
  const [savingQty, setSavingQty] = useState(false)

  const [selectedPlanId, setSelectedPlanId] = useState(ratePlans[0]?.id || '')
  const [priceValue, setPriceValue] = useState('')
  const [salePriceValue, setSalePriceValue] = useState('')
  const [savingPrice, setSavingPrice] = useState(false)

  const [statusOpen, setStatusOpen] = useState<'open' | 'close' | ''>('')
  const [savingStatus, setSavingStatus] = useState(false)

  useEffect(() => { setFrom(initialFrom); setTo(initialTo) }, [initialFrom, initialTo])
  useEffect(() => { if (!selectedPlanId && ratePlans[0]) setSelectedPlanId(ratePlans[0].id) }, [ratePlans, selectedPlanId])

  const toggleDay = (day: number) => {
    const n = new Set(selectedDays)
    if (n.has(day)) n.delete(day); else n.add(day)
    setSelectedDays(n)
  }

  const dateRangeLabel = `${format(from, 'd MMMM, yyyy', { locale: vi })} – ${format(to, 'd MMMM, yyyy', { locale: vi })}`

  const validateRange = () => {
    if (from > to) { toast.error('"Từ" phải trước hoặc bằng "Đến"'); return false }
    if (selectedDays.size === 0) { toast.error('Chọn ít nhất 1 ngày trong tuần'); return false }
    return true
  }

  const saveQuantity = async () => {
    if (!tenantId) return
    if (!validateRange()) return
    const qty = Number(qtyValue)
    if (!qtyValue || isNaN(qty) || qty < 0) { toast.error('Nhập số lượng phòng hợp lệ'); return }
    setSavingQty(true)
    try {
      const days = eachDayInRange(from, to, selectedDays)
      const rows = days.map(d => ({
        tenant_id: tenantId, hotel_id: hotelId, room_type_id: roomTypeId,
        date: toDateKey(d), available_qty: qty, is_closed: false,
      }))
      const { error } = await supabase.from('room_type_availability' as any).upsert(rows as any, { onConflict: 'room_type_id,date' })
      if (error) throw error
      toast.success(`Đã cập nhật ${rows.length} ngày`)
      setQtyValue(''); onSaved?.()
    } catch (e: any) { toast.error('Lỗi: ' + e.message) }
    finally { setSavingQty(false) }
  }

  const savePrice = async () => {
    if (!tenantId) return
    if (!validateRange()) return
    if (!selectedPlanId) { toast.error('Chọn gói giá'); return }
    const price = priceValue ? Number(priceValue.replace(/\D/g, '')) : null
    const salePrice = salePriceValue ? Number(salePriceValue.replace(/\D/g, '')) : null
    if (!price && !salePrice) { toast.error('Nhập giá hoặc giá KM'); return }
    setSavingPrice(true)
    try {
      let realPlanId = selectedPlanId
      if (selectedPlanId === VIRTUAL_DEFAULT_PLAN_ID) {
        realPlanId = await ensureDefaultRatePlan(roomTypeId)
      }
      const days = eachDayInRange(from, to, selectedDays)
      const rows = days.map(d => ({
        tenant_id: tenantId, rate_plan_id: realPlanId, date: toDateKey(d),
        price, sale_price: salePrice,
      }))
      const { error } = await supabase.from('rate_plan_daily_prices' as any).upsert(rows as any, { onConflict: 'rate_plan_id,date' })
      if (error) throw error
      toast.success(`Đã cập nhật giá cho ${rows.length} ngày`)
      setPriceValue(''); setSalePriceValue(''); onSaved?.()
    } catch (e: any) { toast.error('Lỗi: ' + e.message) }
    finally { setSavingPrice(false) }
  }

  const saveStatus = async () => {
    if (!tenantId) return
    if (!validateRange()) return
    if (!statusOpen) { toast.error('Chọn Mở hoặc Đóng'); return }
    setSavingStatus(true)
    try {
      const days = eachDayInRange(from, to, selectedDays)
      const rows = days.map(d => ({
        tenant_id: tenantId, hotel_id: hotelId, room_type_id: roomTypeId,
        date: toDateKey(d), available_qty: defaultQty, is_closed: statusOpen === 'close',
      }))
      // upsert: nếu đã có row thì giữ available_qty cũ — dùng RPC để đỡ ghi đè
      const { data: existing } = await supabase
        .from('room_type_availability' as any)
        .select('date, available_qty')
        .eq('tenant_id', tenantId)
        .eq('room_type_id', roomTypeId)
        .in('date', rows.map(r => r.date))
      const existMap = new Map<string, number>()
      ;(existing ?? []).forEach((r: any) => existMap.set(r.date, r.available_qty))
      const merged = rows.map(r => ({ ...r, available_qty: existMap.get(r.date) ?? r.available_qty }))
      const { error } = await supabase.from('room_type_availability' as any).upsert(merged as any, { onConflict: 'room_type_id,date' })
      if (error) throw error
      toast.success(`Đã ${statusOpen === 'close' ? 'đóng' : 'mở'} ${days.length} ngày`)
      setStatusOpen(''); onSaved?.()
    } catch (e: any) { toast.error('Lỗi: ' + e.message) }
    finally { setSavingStatus(false) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Chỉnh sửa đồng loạt</SheetTitle>
          <p className="text-xs text-muted-foreground">{roomTypeName}</p>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <DateField value={from} onChange={setFrom} label="Từ" />
            <DateField value={to} onChange={setTo} label="Đến và bao gồm" />
          </div>

          <div>
            <Label className="text-xs mb-2 block">Áp dụng cho ngày nào trong tuần?</Label>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map(d => (
                <label key={d.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox checked={selectedDays.has(d.value)} onCheckedChange={() => toggleDay(d.value)} />
                  {d.label}
                </label>
              ))}
            </div>
          </div>

          <Accordion type="multiple" defaultValue={['qty', 'price']} className="border rounded-lg">
            <AccordionItem value="qty">
              <AccordionTrigger className="px-4">
                <div className="text-left">
                  <p className="font-semibold text-sm">Phòng để bán</p>
                  <p className="text-xs text-muted-foreground font-normal">Cập nhật số lượng phòng để bán</p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-2">
                <div className="relative">
                  <Input type="number" min={0} placeholder="0" className="pr-12 h-9" value={qtyValue} onChange={(e) => setQtyValue(e.target.value)} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Phòng</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Khoảng: {dateRangeLabel}</p>
                <Button type="button" size="sm" onClick={saveQuantity} disabled={savingQty}>
                  {savingQty && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Lưu thay đổi
                </Button>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="price">
              <AccordionTrigger className="px-4">
                <div className="text-left">
                  <p className="font-semibold text-sm">Giá</p>
                  <p className="text-xs text-muted-foreground font-normal">Thay đổi giá của 1 gói giá</p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-2">
                {ratePlans.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">Chưa có gói giá. Tạo gói giá trước.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Chọn gói" /></SelectTrigger>
                        <SelectContent>
                          {ratePlans.map(p => <SelectItem key={p.id} value={p.id} className="text-sm">{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <div className="relative">
                        <Input
                          type="text" inputMode="numeric" placeholder="Giá" className="pr-12 h-9 tabular-nums"
                          value={priceValue}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '')
                            setPriceValue(digits ? Number(digits).toLocaleString('vi-VN') : '')
                          }}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">VND</span>
                      </div>
                    </div>
                    <div className="relative">
                      <Input
                        type="text" inputMode="numeric" placeholder="Giá KM (tuỳ chọn)" className="pr-12 h-9 tabular-nums"
                        value={salePriceValue}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '')
                          setSalePriceValue(digits ? Number(digits).toLocaleString('vi-VN') : '')
                        }}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">VND</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Khoảng: {dateRangeLabel}</p>
                    <Button type="button" size="sm" onClick={savePrice} disabled={savingPrice}>
                      {savingPrice && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Lưu thay đổi
                    </Button>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="status">
              <AccordionTrigger className="px-4">
                <div className="text-left">
                  <p className="font-semibold text-sm">Trạng thái bán</p>
                  <p className="text-xs text-muted-foreground font-normal">Mở hoặc đóng cho hạng phòng này</p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-2">
                <RadioGroup value={statusOpen} onValueChange={(v) => setStatusOpen(v as any)}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="open" id="open" />
                    <Label htmlFor="open" className="text-sm cursor-pointer">Mở bán</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="close" id="close" />
                    <Label htmlFor="close" className="text-sm cursor-pointer">Đóng bán</Label>
                  </div>
                </RadioGroup>
                <p className="text-[11px] text-muted-foreground">Khoảng: {dateRangeLabel}</p>
                <Button type="button" size="sm" onClick={saveStatus} disabled={savingStatus}>
                  {savingStatus && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Lưu thay đổi
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  )
}
