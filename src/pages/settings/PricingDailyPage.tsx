// Lịch giá theo ngày — port từ Deal Hotel Hub /dashboard/pricing
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useHotelContext } from '@/contexts/HotelContext'
import { useUser } from '@/hooks/useUser'
import { useRoomTypes } from '@/hooks/useRoomTypes'
import {
  useRatePlans,
  useDailyPrices,
  useRoomTypeAvailability,
  useRoomTypeDefaultQty,
  useResolvedDailyPrices,
  VIRTUAL_DEFAULT_PLAN_ID,
  ensureDefaultRatePlan,
} from '@/hooks/usePricingDaily'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ChevronLeft, ChevronRight, CalendarRange, Settings2, Tags, Lock, Plus, BedDouble, AlertCircle,
} from 'lucide-react'
import { format, addDays, isSameDay, startOfDay } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { toDateKey, getEffectivePriceForDate } from '@/lib/pricing/rate-plan-constants'
import { useQueryClient } from '@tanstack/react-query'
import BulkPricingPanel from '@/components/pricing/BulkPricingPanel'
import RatePlanManager from '@/components/pricing/RatePlanManager'
import { InlinePriceEditor, InlineAvailabilityEditor } from '@/components/pricing/InlineCellEditors'
import {
  useGridSelection, isCellSelected, selectionRange, type Selection,
} from '@/components/pricing/grid/useGridSelection'
import { SelectionToolbar } from '@/components/pricing/grid/SelectionToolbar'
import { applyPriceRange, resetPriceRange, applyAvailabilityRangeSmart } from '@/components/pricing/grid/bulkApply'
import { toast } from 'sonner'

type RangePreset = 7 | 14 | 30

const formatVND = (n: number | null) => {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}tr`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}
const formatVNDFull = (n: number | null | undefined) => n == null ? '—' : `${n.toLocaleString('vi-VN')}đ`

export default function PricingDailyPage() {
  const { selectedHotel } = useHotelContext()
  const { tenantId } = useUser()
  const qc = useQueryClient()
  const { data: roomTypes, isLoading: loadingTypes } = useRoomTypes()
  const visibleTypes = useMemo(
    () => (roomTypes ?? []).filter(rt => {
      if (rt.status !== 'active') return false
      return !selectedHotel?.id || !rt.hotel_id || rt.hotel_id === selectedHotel.id
    }),
    [roomTypes, selectedHotel?.id],
  )

  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>('')
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()))
  const [rangeDays, setRangeDays] = useState<RangePreset>(14)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [planMgrOpen, setPlanMgrOpen] = useState(false)
  const [openCellKey, setOpenCellKey] = useState<string | null>(null)

  const today = useMemo(() => startOfDay(new Date()), [])
  const days = useMemo(() => Array.from({ length: rangeDays }, (_, i) => addDays(startDate, i)), [startDate, rangeDays])
  const endDate = days[days.length - 1]

  const selectedRoomType = visibleTypes.find(rt => rt.id === selectedRoomTypeId) || null

  useEffect(() => {
    if (!selectedRoomTypeId && visibleTypes[0]) setSelectedRoomTypeId(visibleTypes[0].id)
  }, [visibleTypes, selectedRoomTypeId])

  useEffect(() => {
    if (selectedRoomTypeId && !visibleTypes.some(rt => rt.id === selectedRoomTypeId)) {
      setSelectedRoomTypeId(visibleTypes[0]?.id ?? '')
    }
  }, [visibleTypes, selectedRoomTypeId])

  const { data: plans = [] } = useRatePlans(selectedRoomTypeId || null)
  const planIds = useMemo(() => plans.map(p => p.id), [plans])
  const { data: dailyPrices = new Map() } = useDailyPrices(selectedRoomTypeId || null, planIds, startDate, endDate)
  const { data: availability = new Map() } = useRoomTypeAvailability(selectedRoomTypeId || null, startDate, endDate)
  const { data: defaultQty = 0 } = useRoomTypeDefaultQty(selectedRoomTypeId || null)
  const { data: resolved = new Map() } = useResolvedDailyPrices(
    selectedRoomTypeId || null, startDate, endDate, 'daily', selectedHotel?.id ?? null,
  )
  const seasonalsInRange = useMemo(() => {
    const m = new Map<string, { name: string; priority: number }>()
    resolved.forEach(r => {
      r.seasonals.forEach(s => { if (!m.has(s.id)) m.set(s.id, { name: s.name, priority: s.priority }) })
    })
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v }))
  }, [resolved])

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['daily-prices'] })
    qc.invalidateQueries({ queryKey: ['rt-availability'] })
    qc.invalidateQueries({ queryKey: ['rate-plans'] })
    qc.invalidateQueries({ queryKey: ['resolved-daily-prices'] })
    qc.invalidateQueries({ queryKey: ['today-prices-by-hotel'] })
    qc.invalidateQueries({ queryKey: ['available-rooms'] })
    qc.invalidateQueries({ queryKey: ['floor-plan-live'] })
    qc.invalidateQueries({ queryKey: ['pricing-health'] })
  }, [qc])

  // Nếu planId là gói chuẩn ảo → materialize trong DB và refetch
  const resolvePlanId = useCallback(async (planId: string): Promise<string | null> => {
    if (planId !== VIRTUAL_DEFAULT_PLAN_ID) return planId
    if (!selectedRoomType) return null
    try {
      const realId = await ensureDefaultRatePlan(selectedRoomType.id)
      qc.invalidateQueries({ queryKey: ['rate-plans'] })
      return realId
    } catch (e: any) {
      toast.error('Không tạo được gói chuẩn: ' + (e?.message || ''))
      return null
    }
  }, [selectedRoomType, qc])

  // ===== Grid selection =====
  const buildClipFromSelection = (sel: Selection) => {
    const { from, to } = selectionRange(sel)
    const values: Array<Record<string, any>> = []
    for (let i = from; i <= to; i++) {
      const d = days[i]; if (!d) continue
      const key = toDateKey(d)
      if (sel.rowKind === 'price') {
        const planId = sel.rowMeta!
        const dp = dailyPrices.get(`${planId}|${key}`)
        const plan = plans.find(p => p.id === planId)
        values.push({
          price: dp?.price != null ? Number(dp.price) : Number(plan?.price || 0),
          salePrice: dp?.sale_price != null ? Number(dp.sale_price) : null,
          isClosed: !!dp?.is_closed,
        })
      } else {
        const av = availability.get(key)
        values.push({ qty: av?.qty ?? defaultQty, isClosed: !!av?.isClosed })
      }
    }
    return { rowKind: sel.rowKind, values }
  }

  const applyPasteToSelection = async (sel: Selection, clip: { rowKind: string; values: any[] }) => {
    if (!tenantId || !selectedRoomType) return
    if (clip.rowKind !== sel.rowKind) { toast.error('Chỉ có thể dán giữa các ô cùng loại'); return }
    const { from, to } = selectionRange(sel)
    const targetDates: Date[] = []
    for (let i = from; i <= to; i++) if (days[i]) targetDates.push(days[i])
    if (!targetDates.length) return

    if (sel.rowKind === 'price') {
      const rawPlanId = sel.rowMeta!
      const planId = await resolvePlanId(rawPlanId)
      if (!planId) return
      if (clip.values.length === 1) {
        const v = clip.values[0]
        const { error } = await applyPriceRange(planId, tenantId, targetDates, { price: v.price, salePrice: v.salePrice ?? null, isClosed: !!v.isClosed })
        if (error) return toast.error('Dán thất bại: ' + error.message)
      } else {
        for (let idx = 0; idx < targetDates.length; idx++) {
          const v = clip.values[idx % clip.values.length]
          const { error } = await applyPriceRange(planId, tenantId, [targetDates[idx]], { price: v.price, salePrice: v.salePrice ?? null, isClosed: !!v.isClosed })
          if (error) return toast.error('Dán thất bại: ' + error.message)
        }
      }
    } else {
      if (clip.values.length === 1) {
        const v = clip.values[0]
        const { error } = await applyAvailabilityRangeSmart(
          selectedRoomType.id, tenantId, selectedHotel?.id ?? null, targetDates, defaultQty,
          { qty: Number(v.qty) || 0, isClosed: !!v.isClosed }, availability,
        )
        if (error) return toast.error('Dán thất bại: ' + error.message)
      } else {
        for (let idx = 0; idx < targetDates.length; idx++) {
          const v = clip.values[idx % clip.values.length]
          const { error } = await applyAvailabilityRangeSmart(
            selectedRoomType.id, tenantId, selectedHotel?.id ?? null, [targetDates[idx]], defaultQty,
            { qty: Number(v.qty) || 0, isClosed: !!v.isClosed }, availability,
          )
          if (error) return toast.error('Dán thất bại: ' + error.message)
        }
      }
    }
    toast.success(`Đã dán cho ${targetDates.length} ngày`)
    refresh()
  }

  const grid = useGridSelection({
    onCopy: (sel) => buildClipFromSelection(sel),
    onPaste: (sel, clip) => { applyPasteToSelection(sel, clip) },
  })

  // Fill handle
  useEffect(() => {
    const handler = async (e: Event) => {
      const sel = grid.selection
      if (!sel || !selectedRoomType || !tenantId) return
      const { from, to } = selectionRange(sel)
      if (from === to) return
      const sourceIdx = (e as CustomEvent).detail?.from?.colIndex ?? sel.startCol
      const sourceDate = days[sourceIdx]; if (!sourceDate) return
      const sourceKey = toDateKey(sourceDate)
      const targetDates: Date[] = []
      for (let i = from; i <= to; i++) if (i !== sourceIdx && days[i]) targetDates.push(days[i])
      if (!targetDates.length) return
      if (sel.rowKind === 'price') {
        const rawPlanId = sel.rowMeta!
        const planId = await resolvePlanId(rawPlanId)
        if (!planId) return
        const dp = dailyPrices.get(`${rawPlanId}|${sourceKey}`)
        const plan = plans.find(p => p.id === rawPlanId)
        const payload = {
          price: dp?.price != null ? Number(dp.price) : Number(plan?.price || 0),
          salePrice: dp?.sale_price != null ? Number(dp.sale_price) : null,
          isClosed: !!dp?.is_closed,
        }
        const { error } = await applyPriceRange(planId, tenantId, targetDates, payload)
        if (error) return toast.error('Fill thất bại: ' + error.message)
      } else {
        const av = availability.get(sourceKey)
        const payload = { qty: av?.qty ?? defaultQty, isClosed: !!av?.isClosed }
        const { error } = await applyAvailabilityRangeSmart(
          selectedRoomType.id, tenantId, selectedHotel?.id ?? null, targetDates, defaultQty, payload, availability,
        )
        if (error) return toast.error('Fill thất bại: ' + error.message)
      }
      toast.success(`Đã copy cho ${targetDates.length} ngày`)
      refresh()
    }
    window.addEventListener('grid-fill-end', handler)
    return () => window.removeEventListener('grid-fill-end', handler)
  }, [grid.selection, days, dailyPrices, plans, availability, selectedRoomType, tenantId, defaultQty, selectedHotel?.id, refresh, resolvePlanId])

  // Toolbar
  const selectionDates = (): Date[] => {
    if (!grid.selection) return []
    const { from, to } = selectionRange(grid.selection)
    const out: Date[] = []
    for (let i = from; i <= to; i++) if (days[i]) out.push(days[i])
    return out
  }

  const toolbarApplyPrice = async (payload: { price?: number | null; salePrice?: number | null }) => {
    if (!tenantId) return
    const sel = grid.selection; if (!sel || sel.rowKind !== 'price') return
    const planId = await resolvePlanId(sel.rowMeta!)
    if (!planId) return
    const dates = selectionDates()
    const { error } = await applyPriceRange(planId, tenantId, dates, {
      ...(payload.price !== undefined ? { price: payload.price, isClosed: false } : {}),
      ...(payload.salePrice !== undefined ? { salePrice: payload.salePrice } : {}),
    })
    if (error) return toast.error('Lưu thất bại: ' + error.message)
    toast.success(`Đã cập nhật ${dates.length} ngày`); refresh()
  }

  const toolbarApplyQty = async (n: number) => {
    if (!tenantId) return
    const sel = grid.selection; if (!sel || !selectedRoomType || sel.rowKind === 'price') return
    const dates = selectionDates()
    const { error } = await applyAvailabilityRangeSmart(
      selectedRoomType.id, tenantId, selectedHotel?.id ?? null, dates, defaultQty, { qty: n, isClosed: false }, availability,
    )
    if (error) return toast.error('Lưu thất bại: ' + error.message)
    toast.success(`Đã cập nhật ${dates.length} ngày`); refresh()
  }

  const toolbarSetClosed = async (closed: boolean) => {
    if (!tenantId) return
    const sel = grid.selection; if (!sel || !selectedRoomType) return
    const dates = selectionDates()
    if (sel.rowKind === 'price') {
      const planId = await resolvePlanId(sel.rowMeta!)
      if (!planId) return
      const { error } = await applyPriceRange(planId, tenantId, dates, { isClosed: closed })
      if (error) return toast.error('Lưu thất bại: ' + error.message)
    } else {
      const { error } = await applyAvailabilityRangeSmart(
        selectedRoomType.id, tenantId, selectedHotel?.id ?? null, dates, defaultQty,
        closed ? { isClosed: true } : { isClosed: false, qty: defaultQty }, availability,
      )
      if (error) return toast.error('Lưu thất bại: ' + error.message)
    }
    toast.success(closed ? `Đã đóng bán ${dates.length} ngày` : `Đã mở bán ${dates.length} ngày`); refresh()
  }

  const toolbarReset = async () => {
    const sel = grid.selection; if (!sel || sel.rowKind !== 'price') return
    if (sel.rowMeta === VIRTUAL_DEFAULT_PLAN_ID) {
      toast.info('Gói chuẩn ảo không có dữ liệu để reset')
      return
    }
    const dates = selectionDates()
    const { error } = await resetPriceRange(sel.rowMeta!, dates)
    if (error) return toast.error('Reset thất bại: ' + error.message)
    toast.success(`Đã reset ${dates.length} ngày về giá mặc định`); refresh()
  }

  const toolbarCopy = () => {
    const sel = grid.selection; if (!sel) return
    const clip = buildClipFromSelection(sel)
    grid.setClipboard(clip)
    try {
      const text = clip.values.map(v => v.price ?? v.qty ?? '').join('\t')
      navigator.clipboard?.writeText(text).catch(() => {})
    } catch { /* noop */ }
    toast.success(`Đã copy ${clip.values.length} ô`)
  }

  const toolbarPaste = () => {
    const sel = grid.selection; if (!sel || !grid.clipboard) return
    applyPasteToSelection(sel, grid.clipboard)
  }

  const selectionRowLabel = (() => {
    const sel = grid.selection; if (!sel) return ''
    if (sel.rowKind === 'status') return 'Trạng thái'
    if (sel.rowKind === 'qty') return 'Phòng để bán'
    const plan = plans.find(p => p.id === sel.rowMeta)
    return plan?.name ?? 'Gói giá'
  })()

  const selectionCount = grid.selection
    ? selectionRange(grid.selection).to - selectionRange(grid.selection).from + 1
    : 0

  if (!selectedHotel) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Vui lòng chọn khách sạn để thiết lập giá theo ngày.</AlertDescription>
        </Alert>
      </div>
    )
  }

  const dateRangeLabel = `${format(startDate, 'd MMM', { locale: vi })} – ${format(endDate, 'd MMM, yyyy', { locale: vi })}`

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarRange className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold leading-tight">Lịch giá theo ngày</h2>
                <p className="text-xs text-muted-foreground">Giá và tình trạng phòng theo từng ngày · {selectedHotel.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5">
              {([7, 14, 30] as RangePreset[]).map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRangeDays(n)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                    rangeDays === n ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {n} ngày
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedRoomTypeId} onValueChange={setSelectedRoomTypeId} disabled={!loadingTypes && visibleTypes.length === 0}>
              <SelectTrigger className="h-9 text-sm w-full sm:w-[260px]">
                <BedDouble className="h-4 w-4 mr-1.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder={!loadingTypes && visibleTypes.length === 0 ? 'Chưa có hạng phòng' : 'Chọn hạng phòng'} />
              </SelectTrigger>
              <SelectContent>
                {visibleTypes.map(rt => (
                  <SelectItem key={rt.id} value={rt.id} className="text-sm">{rt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex-1" />

            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setPlanMgrOpen(true)} disabled={!selectedRoomTypeId}>
              <Tags className="h-4 w-4 mr-1.5" /> Quản lý gói giá
            </Button>
            <Button type="button" size="sm" className="h-9" onClick={() => setBulkOpen(true)} disabled={!selectedRoomTypeId || plans.length === 0}>
              <Settings2 className="h-4 w-4 mr-1.5" /> Chỉnh sửa đồng loạt
            </Button>
          </div>

          {!loadingTypes && visibleTypes.length === 0 && (
            <Alert>
              <BedDouble className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
                <span>Chưa có hạng phòng nào cho khách sạn này. Tạo hạng phòng trước khi thiết lập lịch giá theo ngày.</span>
                <Button type="button" size="sm" variant="outline" asChild>
                  <a href="/settings/categories?tab=rooms">
                    <Plus className="h-4 w-4 mr-1.5" /> Tạo hạng phòng
                  </a>
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Date navigator */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center rounded-lg border bg-card overflow-hidden">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => setStartDate(d => addDays(d, -rangeDays))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="px-3 h-8 text-sm font-medium hover:bg-muted/60 transition-colors min-w-[200px] text-center">
                  {dateRangeLabel}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single" selected={startDate}
                  onSelect={(d) => { if (d) { setStartDate(startOfDay(d)); setDatePickerOpen(false) } }}
                  locale={vi} initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => setStartDate(d => addDays(d, rangeDays))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setStartDate(today)} disabled={isSameDay(startDate, today)}>
            Hôm nay
          </Button>
        </div>

        {/* Body */}
        {loadingTypes ? (
          <Skeleton className="h-[400px] w-full rounded-lg" />
        ) : visibleTypes.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card py-16 text-center">
            <BedDouble className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium mb-1">Chưa có hạng phòng nào</p>
            <p className="text-xs text-muted-foreground">Hãy tạo hạng phòng trước khi thiết lập giá.</p>
          </div>
        ) : !selectedRoomType ? null : (
          <>
            <div className="rounded-lg border bg-card flex flex-col w-full min-w-0 max-w-full overflow-hidden max-h-[calc(100vh-260px)]">
              <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between gap-2 flex-wrap shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <BedDouble className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">{selectedRoomType.name}</p>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">SL mặc định: <strong className="text-foreground">{defaultQty}</strong></span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground"><strong className="text-foreground">{plans.length}</strong> gói giá</span>
                  {seasonalsInRange.length > 0 && (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href="/settings/pricing?tab=seasonal" className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                            {seasonalsInRange.length} quy tắc mùa đang áp
                          </a>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs font-semibold mb-1">Quy tắc đang ảnh hưởng khoảng này:</p>
                          <ul className="text-xs space-y-0.5">
                            {seasonalsInRange.map(s => (
                              <li key={s.id}>• {s.name} <span className="text-muted-foreground">(ưu tiên {s.priority})</span></li>
                            ))}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                <SelectionToolbar
                  count={selectionCount}
                  rowKind={grid.selection?.rowKind ?? null}
                  rowLabel={selectionRowLabel}
                  hasClipboard={!!grid.clipboard && (!grid.selection || grid.clipboard.rowKind === grid.selection.rowKind)}
                  onApplyPrice={toolbarApplyPrice}
                  onApplyQty={toolbarApplyQty}
                  onClose={() => toolbarSetClosed(true)}
                  onOpen={() => toolbarSetClosed(false)}
                  onReset={grid.selection?.rowKind === 'price' ? toolbarReset : undefined}
                  onCopy={toolbarCopy}
                  onPaste={toolbarPaste}
                  onClear={grid.clearSelection}
                />
              </div>

              <div className="flex-1 min-h-0 min-w-0 max-w-full overflow-auto">
                <table className="border-collapse text-xs min-w-max">
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-40 bg-card border-b border-r px-3 py-2 text-left font-semibold w-[180px] min-w-[180px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                        Ngày
                      </th>
                      {days.map((d, idx) => {
                        const dow = d.getDay()
                        const isWeekend = dow === 0 || dow === 6
                        const isMonday = dow === 1
                        const isToday = isSameDay(d, today)
                        return (
                          <th
                            key={d.toISOString()}
                            className={cn(
                              'sticky top-0 z-30 border-b border-r px-1 py-1.5 text-center font-medium min-w-[60px] relative',
                              isWeekend ? 'bg-amber-50/95' : 'bg-card',
                              isMonday && idx > 0 && 'border-l-2 border-l-border',
                              isToday && '!bg-primary/15',
                            )}
                          >
                            <div className={cn('text-[10px] uppercase font-medium', isToday ? 'text-primary' : 'text-muted-foreground')}>
                              {format(d, 'EEEEEE', { locale: vi })}
                            </div>
                            <div className={cn('text-sm font-bold', isToday && 'text-primary')}>{format(d, 'd')}</div>
                            {isToday && <div className="absolute -bottom-px left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-t" />}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>

                  <tbody>
                    {/* Trạng thái */}
                    <tr>
                      <td className="sticky left-0 z-20 bg-card border-b border-r px-3 py-2 font-medium text-foreground/80 w-[180px] min-w-[180px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">Trạng thái</td>
                      {days.map((d, idx) => {
                        const dow = d.getDay()
                        const isWeekend = dow === 0 || dow === 6
                        const isMonday = dow === 1
                        const isToday = isSameDay(d, today)
                        const av = availability.get(toDateKey(d))
                        const isClosed = av?.isClosed ?? false
                        const qty = av?.qty ?? defaultQty
                        const noData = !av
                        const soldOut = !isClosed && qty <= 0
                        const cellKey = `status-${toDateKey(d)}`
                        const rowKey = 'status'
                        const selected = isCellSelected(grid.selection, rowKey, idx)
                        const isSingleSelected = selected && selectionCount === 1 && grid.selection?.startCol === idx && grid.selection?.endCol === idx
                        const popoverOpen = openCellKey === cellKey && (!grid.selection || selectionCount <= 1)
                        return (
                          <td
                            key={`s-${d.toISOString()}`}
                            data-grid-cell="1"
                            onMouseDown={(e) => grid.handleCellMouseDown(e, { rowKey, rowKind: 'status', colIndex: idx })}
                            onMouseEnter={() => grid.handleCellMouseEnter({ rowKey, rowKind: 'status', colIndex: idx })}
                            className={cn(
                              'border-b border-r p-0 text-center select-none relative',
                              isWeekend && !isClosed && 'bg-amber-50/40',
                              isMonday && idx > 0 && 'border-l-2 border-l-border',
                              isToday && !isClosed && 'bg-primary/5',
                              isClosed && 'bg-destructive/10',
                              selected && 'ring-2 ring-inset ring-primary bg-primary/15',
                            )}
                          >
                            <InlineAvailabilityEditor
                              open={popoverOpen}
                              onOpenChange={(v) => { if (v && grid.wasDragMoved()) { grid.resetDragMoved(); return } setOpenCellKey(v ? cellKey : null) }}
                              roomTypeId={selectedRoomType.id}
                              hotelId={selectedHotel?.id ?? null}
                              defaultQty={defaultQty}
                              date={d}
                              initialQty={qty}
                              initialIsClosed={isClosed}
                              onSaved={refresh}
                            >
                              <button aria-label="Lock" type="button" className="w-full h-full px-1 py-2 hover:bg-primary/5 transition-colors cursor-pointer">
                                {isClosed ? (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-destructive">
                                    <Lock className="h-2.5 w-2.5" /> Đóng
                                  </span>
                                ) : soldOut ? (
                                  <span className="text-[10px] font-semibold text-amber-600">Hết</span>
                                ) : noData ? (
                                  <span className="text-[10px] text-muted-foreground/50">—</span>
                                ) : (
                                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" title="Mở bán" />
                                )}
                              </button>
                            </InlineAvailabilityEditor>
                            {isSingleSelected && (
                              <span
                                data-grid-fill="1"
                                onMouseDown={(e) => grid.startFill(e, { rowKey, rowKind: 'status', colIndex: idx })}
                                className="absolute -bottom-0.5 -right-0.5 h-2 w-2 bg-primary border border-background cursor-crosshair z-10"
                              />
                            )}
                          </td>
                        )
                      })}
                    </tr>

                    {/* Phòng để bán */}
                    <tr>
                      <td className="sticky left-0 z-20 bg-card border-b border-r px-3 py-2 font-medium text-foreground/80 w-[180px] min-w-[180px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">Phòng để bán</td>
                      {days.map((d, idx) => {
                        const dow = d.getDay()
                        const isWeekend = dow === 0 || dow === 6
                        const isMonday = dow === 1
                        const isToday = isSameDay(d, today)
                        const av = availability.get(toDateKey(d))
                        const qty = av?.qty ?? defaultQty
                        const isClosed = av?.isClosed ?? false
                        const isLow = !isClosed && qty > 0 && qty <= Math.max(1, Math.floor(defaultQty * 0.2))
                        const cellKey = `qty-${toDateKey(d)}`
                        const rowKey = 'qty'
                        const selected = isCellSelected(grid.selection, rowKey, idx)
                        const isSingleSelected = selected && selectionCount === 1 && grid.selection?.startCol === idx && grid.selection?.endCol === idx
                        const popoverOpen = openCellKey === cellKey && (!grid.selection || selectionCount <= 1)
                        return (
                          <td
                            key={`q-${d.toISOString()}`}
                            data-grid-cell="1"
                            onMouseDown={(e) => grid.handleCellMouseDown(e, { rowKey, rowKind: 'qty', colIndex: idx })}
                            onMouseEnter={() => grid.handleCellMouseEnter({ rowKey, rowKind: 'qty', colIndex: idx })}
                            className={cn(
                              'border-b border-r p-0 text-center font-semibold select-none relative',
                              isWeekend && !isClosed && 'bg-amber-50/40',
                              isMonday && idx > 0 && 'border-l-2 border-l-border',
                              isToday && !isClosed && 'bg-primary/5',
                              isClosed && 'bg-destructive/5 text-muted-foreground/50',
                              isLow ? 'text-destructive' : !isClosed && 'text-foreground',
                              selected && 'ring-2 ring-inset ring-primary bg-primary/15',
                            )}
                          >
                            <InlineAvailabilityEditor
                              open={popoverOpen}
                              onOpenChange={(v) => { if (v && grid.wasDragMoved()) { grid.resetDragMoved(); return } setOpenCellKey(v ? cellKey : null) }}
                              roomTypeId={selectedRoomType.id}
                              hotelId={selectedHotel?.id ?? null}
                              defaultQty={defaultQty}
                              date={d}
                              initialQty={qty}
                              initialIsClosed={isClosed}
                              onSaved={refresh}
                            >
                              <button type="button" className="w-full h-full px-1 py-2 hover:bg-primary/5 transition-colors cursor-pointer">
                                {isClosed ? '—' : qty}
                              </button>
                            </InlineAvailabilityEditor>
                            {isSingleSelected && (
                              <span
                                data-grid-fill="1"
                                onMouseDown={(e) => grid.startFill(e, { rowKey, rowKind: 'qty', colIndex: idx })}
                                className="absolute -bottom-0.5 -right-0.5 h-2 w-2 bg-primary border border-background cursor-crosshair z-10"
                              />
                            )}
                          </td>
                        )
                      })}
                    </tr>

                    {plans.length === 0 ? (
                      <tr>
                        <td colSpan={rangeDays + 1} className="px-6 py-10 text-center">
                          <Tags className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                          <p className="text-sm font-medium mb-1">Chưa có gói giá nào</p>
                          <p className="text-xs text-muted-foreground mb-3">Tạo gói giá đầu tiên để bắt đầu thiết lập giá theo ngày.</p>
                          <Button type="button" size="sm" onClick={() => setPlanMgrOpen(true)}>
                            <Plus className="h-4 w-4 mr-1.5" /> Tạo gói giá
                          </Button>
                        </td>
                      </tr>
                    ) : (
                      plans.map((plan) => (
                        <tr key={plan.id}>
                          <td className="sticky left-0 z-20 bg-card border-b border-r px-3 py-2 w-[180px] min-w-[180px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-primary truncate text-xs">{plan.name}</p>
                              {(plan as any).is_default && (
                                <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-primary/10 text-primary font-semibold">Mặc định</span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              Giá chuẩn: <strong>{formatVND(plan.price)}</strong>
                              {(plan as any).isVirtual && <span className="ml-1 text-muted-foreground/70">· lấy từ Giá mặc định</span>}
                            </p>
                          </td>
                          {days.map((d, idx) => {
                            const dow = d.getDay()
                            const isWeekend = dow === 0 || dow === 6
                            const isMonday = dow === 1
                            const isToday = isSameDay(d, today)
                            const dailyKey = `${plan.id}|${toDateKey(d)}`
                            const hasOverride = dailyPrices.has(dailyKey)
                            const planResult = getEffectivePriceForDate(plan, dailyPrices, d)
                            const roomClosed = availability.get(toDateKey(d))?.isClosed ?? false
                            const isClosed = roomClosed || planResult.isClosed
                            const price = isClosed ? null : planResult.price
                            const isSale = !isClosed && planResult.isSale
                            const basePrice = plan.price ?? 0
                            const cellKey = `price-${plan.id}-${toDateKey(d)}`
                            const dailyData = dailyPrices.get(dailyKey)
                            const rowKey = `price-${plan.id}`
                            const selected = isCellSelected(grid.selection, rowKey, idx)
                            const isSingleSelected = selected && selectionCount === 1 && grid.selection?.startCol === idx && grid.selection?.endCol === idx
                            const popoverOpen = openCellKey === cellKey && (!grid.selection || selectionCount <= 1)
                            return (
                              <td
                                key={`${plan.id}-${d.toISOString()}`}
                                data-grid-cell="1"
                                onMouseDown={(e) => grid.handleCellMouseDown(e, { rowKey, rowKind: 'price', rowMeta: plan.id, colIndex: idx })}
                                onMouseEnter={() => grid.handleCellMouseEnter({ rowKey, rowKind: 'price', rowMeta: plan.id, colIndex: idx })}
                                className={cn(
                                  'border-b border-r p-0 text-center align-middle select-none relative',
                                  isWeekend && !isClosed && 'bg-amber-50/30',
                                  isMonday && idx > 0 && 'border-l-2 border-l-border',
                                  isToday && !isClosed && 'bg-primary/5',
                                  isClosed && 'bg-destructive/10',
                                  selected && 'ring-2 ring-inset ring-primary bg-primary/15',
                                )}
                              >
                                <InlinePriceEditor
                                  open={popoverOpen}
                                  onOpenChange={(v) => { if (v && grid.wasDragMoved()) { grid.resetDragMoved(); return } setOpenCellKey(v ? cellKey : null) }}
                                  ratePlanId={plan.id}
                                  roomTypeId={selectedRoomType.id}
                                  planName={plan.name}
                                  basePrice={Number(plan.price || 0)}
                                  date={d}
                                  initialPrice={dailyData?.price != null ? Number(dailyData.price) : null}
                                  initialSalePrice={dailyData?.sale_price != null ? Number(dailyData.sale_price) : null}
                                  initialIsClosed={!!dailyData?.is_closed}
                                  hasOverride={hasOverride}
                                  onSaved={refresh}
                                >
                                  {(() => {
                                    const resolvedDay = resolved.get(toDateKey(d))
                                    const hasSeasonal = !hasOverride && !isClosed && (resolvedDay?.seasonals.length ?? 0) > 0
                                    const seasonalLabel = hasSeasonal
                                      ? resolvedDay!.seasonals.map(s =>
                                          `${s.name}: ${s.mode === 'overwrite' ? '=' : (s.adjust_value >= 0 ? '+' : '')}${s.adjust_value}${s.adjust_type === 'percent' ? '%' : 'đ'}`
                                        ).join(' · ')
                                      : ''
                                    return (
                                      <button
                                        type="button"
                                        title={`${format(d, 'EEEE, d/M/yyyy', { locale: vi })} — ${isClosed ? 'Đóng bán' : formatVNDFull(price)}${hasOverride ? ' (tùy chỉnh)' : ''}${hasSeasonal ? ' · Mùa: ' + seasonalLabel : ''}`}
                                        className={cn(
                                          'w-full px-1 py-1.5 cursor-pointer hover:bg-primary/10 transition-colors relative',
                                          hasOverride && !isClosed && 'border-b-2 border-b-emerald-500/70',
                                        )}
                                      >
                                        {hasSeasonal && (
                                          <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Có quy tắc mùa" />
                                        )}
                                        {isClosed ? (
                                          <div className="flex flex-col items-center gap-0.5 text-destructive">
                                            <Lock className="h-3 w-3" />
                                            <span className="text-[10px] font-medium">Đóng</span>
                                          </div>
                                        ) : (
                                          <>
                                            <div className={cn(
                                              'text-[11px] font-semibold leading-tight',
                                              isSale && 'text-emerald-700',
                                              hasSeasonal && !isSale && 'text-amber-700',
                                            )}>
                                              {formatVND(hasSeasonal ? Math.round(resolvedDay!.final_price) : price)}
                                            </div>
                                            {isSale && basePrice && price != null && price < basePrice && (
                                              <div className="text-[9px] text-muted-foreground line-through leading-tight">
                                                {formatVND(basePrice)}
                                              </div>
                                            )}
                                            {hasSeasonal && !isSale && (
                                              <div className="text-[9px] text-muted-foreground line-through leading-tight">
                                                {formatVND(basePrice)}
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </button>
                                    )
                                  })()}
                                </InlinePriceEditor>
                                {isSingleSelected && (
                                  <span
                                    data-grid-fill="1"
                                    onMouseDown={(e) => grid.startFill(e, { rowKey, rowKind: 'price', rowMeta: plan.id, colIndex: idx })}
                                    className="absolute -bottom-0.5 -right-0.5 h-2 w-2 bg-primary border border-background cursor-crosshair z-10"
                                  />
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {plans.length > 0 && (
              <div className="flex items-center gap-4 flex-wrap text-[11px] text-muted-foreground px-1">
                <LegendChip color="bg-amber-50 border-amber-200" label="Cuối tuần" />
                <LegendChip color="bg-primary/10 border-primary/30" label="Hôm nay" />
                <LegendChip color="bg-emerald-50 border-b-2 border-emerald-500" label="Có giá tuỳ chỉnh" />
                <LegendChip color="bg-destructive/10 border-destructive/30" label="Đóng bán" />
                <span className="ml-auto">Click 1 ô để sửa · Kéo bôi đen nhiều ngày · ⌘C / ⌘V để copy-paste · Kéo chấm góc dưới-phải để fill</span>
              </div>
            )}
          </>
        )}

        {selectedRoomType && (
          <>
            <BulkPricingPanel
              open={bulkOpen}
              onOpenChange={setBulkOpen}
              roomTypeId={selectedRoomType.id}
              roomTypeName={selectedRoomType.name}
              hotelId={selectedHotel?.id ?? null}
              ratePlans={plans.map(p => ({ id: p.id, name: p.name, price: Number(p.price || 0) }))}
              initialFrom={startDate}
              initialTo={endDate}
              defaultQty={defaultQty}
              onSaved={refresh}
            />
            <RatePlanManager
              roomTypeId={selectedRoomType.id}
              roomTypeName={selectedRoomType.name}
              hotelId={selectedHotel?.id ?? null}
              open={planMgrOpen}
              onOpenChange={setPlanMgrOpen}
              onSaved={refresh}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  )
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('inline-block h-3 w-4 rounded-sm border', color)} />
      <span>{label}</span>
    </div>
  )
}
