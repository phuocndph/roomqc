import { useMemo, useState } from 'react'
import { useHotelContext } from '@/contexts/HotelContext'
import { useRoomTypes } from '@/hooks/useRoomTypes'
import { useRoomTypeRates, useUpsertRoomTypeRate, type RoomTypeRate } from '@/hooks/useRoomTypeRates'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

type Bucket = 'daily_rate' | 'hourly_rate' | 'monthly_rate'

const BUCKETS: { key: Bucket; label: string; hint: string }[] = [
  { key: 'daily_rate', label: 'Giá đêm', hint: 'Giá nền — Mùa & Lịch ngày sẽ ghi đè' },
  { key: 'hourly_rate', label: 'Giá giờ', hint: 'Cố định — không áp dụng Mùa' },
  { key: 'monthly_rate', label: 'Giá tháng', hint: 'Cố định — không áp dụng Mùa' },
]

export default function PricingV2Page() {
  const { selectedHotel } = useHotelContext()
  const { data: roomTypes, isLoading: loadingTypes } = useRoomTypes()
  const { data: rates, isLoading: loadingRates } = useRoomTypeRates(selectedHotel?.id ?? null)
  const upsert = useUpsertRoomTypeRate()

  const ratesByType = useMemo(() => {
    const m: Record<string, RoomTypeRate> = {}
    rates?.forEach((r) => { m[r.room_type_id] = r })
    return m
  }, [rates])

  const [draft, setDraft] = useState<Record<string, Partial<RoomTypeRate>>>({})

  const visibleTypes = roomTypes?.filter((rt) =>
    !selectedHotel?.id || !rt.hotel_id || rt.hotel_id === selectedHotel.id
  )

  if (!selectedHotel) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Vui lòng chọn khách sạn để cấu hình bảng giá</AlertDescription>
        </Alert>
      </div>
    )
  }

  const loading = loadingTypes || loadingRates

  const getVal = (rtId: string, key: Bucket): number | undefined => {
    const d = draft[rtId]?.[key]
    if (d !== undefined) return d as number
    return ratesByType[rtId]?.[key] ?? undefined
  }

  const setVal = (rtId: string, key: Bucket, raw: string) => {
    const num = raw === '' ? undefined : Number(raw.replace(/[^\d.]/g, ''))
    setDraft((prev) => ({ ...prev, [rtId]: { ...prev[rtId], [key]: num } }))
  }

  const isDirty = (rtId: string) => !!draft[rtId] && Object.keys(draft[rtId]).length > 0

  const save = async (rtId: string) => {
    const existing = ratesByType[rtId]
    const payload: any = {
      room_type_id: rtId,
      hotel_id: selectedHotel.id,
      daily_rate: getVal(rtId, 'daily_rate') ?? existing?.daily_rate ?? 0,
      hourly_rate: getVal(rtId, 'hourly_rate') ?? existing?.hourly_rate ?? null,
      monthly_rate: getVal(rtId, 'monthly_rate') ?? existing?.monthly_rate ?? null,
    }
    await upsert.mutateAsync(payload)
    setDraft((prev) => { const n = { ...prev }; delete n[rtId]; return n })
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Bảng giá loại phòng</h1>
          <p className="text-sm text-muted-foreground">
            3 trục giá: <strong>Giá đêm</strong> (linh hoạt, áp Mùa & Lịch ngày), <strong>Giá giờ</strong> & <strong>Giá tháng</strong> (cố định)
            cho từng loại phòng tại {selectedHotel.name}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/settings/pricing?tab=daily">Lịch giá theo ngày →</a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/settings/pricing?tab=seasonal">Quy tắc mùa →</a>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !visibleTypes?.length ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Chưa có loại phòng nào. Hãy tạo loại phòng trước.
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3 font-medium">Loại phòng</th>
                {BUCKETS.map((b) => (
                  <th key={b.key} className="p-3 font-medium text-right">
                    <div>{b.label} (đ)</div>
                    <div className="text-[10px] font-normal text-muted-foreground mt-0.5">{b.hint}</div>
                  </th>
                ))}
                <th className="p-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {visibleTypes.map((rt) => (
                <tr key={rt.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{rt.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{rt.code}</div>
                  </td>
                  {BUCKETS.map((b) => (
                    <td key={b.key} className="p-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        className="h-8 text-right font-mono"
                        value={getVal(rt.id, b.key) ?? ''}
                        onChange={(e) => setVal(rt.id, b.key, e.target.value)}
                        placeholder="—"
                      />
                    </td>
                  ))}
                  <td className="p-2 text-right">
                    <Button
                      size="sm"
                      type="button"
                      disabled={!isDirty(rt.id) || upsert.isPending}
                      onClick={() => save(rt.id)}
                    >
                      Lưu
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Mẹo: bỏ trống = không cho phép loại đặt phòng đó. Giờ qua đêm mặc định 22:00–09:00 (sẽ cấu hình ở mục riêng).
      </p>
    </div>
  )
}
