import { useState, useEffect } from 'react'
import { useHotelContext } from '@/contexts/HotelContext'
import { useRoomCheckLeanConfig } from '@/hooks/useRoomCheckLeanConfig'
import { useUpdateRoomCheckLeanConfig } from '@/hooks/useUpdateRoomCheckLeanConfig'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Info } from 'lucide-react'
import { RoomCheckSettingsHistory } from '@/components/settings/RoomCheckSettingsHistory'

export default function RoomCheckSettingsPage() {
  const { selectedHotel, availableHotels } = useHotelContext()
  const [hotelId, setHotelId] = useState<string | null>(selectedHotel?.id ?? null)

  useEffect(() => {
    if (!hotelId && selectedHotel?.id) setHotelId(selectedHotel.id)
  }, [selectedHotel, hotelId])

  const { data: config, isLoading } = useRoomCheckLeanConfig(hotelId)
  const updateMut = useUpdateRoomCheckLeanConfig()

  // Local form state, sync with config
  const [useLean, setUseLean] = useState(true)
  const [quickPathEnabled, setQuickPathEnabled] = useState(true)
  const [quickPathLimit, setQuickPathLimit] = useState(30)
  const [photoDamaged, setPhotoDamaged] = useState(true)
  const [photoMissing, setPhotoMissing] = useState(false)
  const [photoConsumed, setPhotoConsumed] = useState(false)

  useEffect(() => {
    if (!config) return
    setUseLean(config.use_lean)
    setQuickPathEnabled(config.quick_path_enabled)
    setQuickPathLimit(config.quick_path_rate_limit_minutes)
    setPhotoDamaged(config.photo_required_damaged_lost)
    setPhotoMissing(config.photo_required_missing_replace)
    setPhotoConsumed(config.photo_required_consumed_chargeable)
  }, [config])

  const handleSave = () => {
    if (!hotelId) return
    updateMut.mutate({
      hotelId,
      patch: {
        use_lean: useLean,
        quick_path_enabled: quickPathEnabled,
        quick_path_rate_limit_minutes: Math.max(1, Number(quickPathLimit) || 30),
        photo_required_damaged_lost: photoDamaged,
        photo_required_missing_replace: photoMissing,
        photo_required_consumed_chargeable: photoConsumed,
      },
    })
  }

  return (
    <div className="container max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Cấu hình kiểm tra phòng</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bật/tắt phiên bản Lean và quy tắc thao tác cho từng khách sạn.
        </p>
      </div>

      {/* Hotel selector */}
      {availableHotels.length > 1 && (
        <div className="space-y-2">
          <Label>Khách sạn áp dụng</Label>
          <Select value={hotelId ?? ''} onValueChange={(v) => setHotelId(v)}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue placeholder="Chọn khách sạn" />
            </SelectTrigger>
            <SelectContent>
              {availableHotels.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!hotelId ? (
        <div className="text-sm text-muted-foreground">Chọn một khách sạn để cấu hình.</div>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {/* Lean toggle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phiên bản Lean</CardTitle>
              <CardDescription>
                Bật phiên bản giao diện mới gọn nhẹ cho thao tác kiểm tra phòng hằng ngày.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="use-lean" className="text-sm font-medium">
                    Dùng giao diện Lean
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Khi tắt, hệ thống sẽ dùng wizard kiểm tra phòng cũ.
                  </p>
                </div>
                <Switch id="use-lean" checked={useLean} onCheckedChange={setUseLean} />
              </div>

              {!useLean && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Khách sạn này sẽ dùng wizard cũ. Một số tính năng mới (Quick Path, Resume Draft 24h)
                    sẽ không khả dụng.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Path */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Path (1 chạm xác nhận OK)</CardTitle>
              <CardDescription>
                Cho phép xác nhận nhanh "Phòng OK hoàn toàn" cho ca kiểm tra hằng ngày.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="quick-enabled" className="text-sm font-medium">
                  Bật Quick Path
                </Label>
                <Switch
                  id="quick-enabled"
                  checked={quickPathEnabled}
                  onCheckedChange={setQuickPathEnabled}
                  disabled={!useLean}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-limit" className="text-sm">
                  Khoảng cách tối thiểu giữa 2 lần Quick Path (phút)
                </Label>
                <Input
                  id="quick-limit"
                  type="number"
                  min={1}
                  max={1440}
                  value={quickPathLimit}
                  onChange={(e) => setQuickPathLimit(Number(e.target.value))}
                  className="w-32"
                  disabled={!useLean || !quickPathEnabled}
                />
                <p className="text-xs text-muted-foreground">
                  Tránh nhân viên nhấn xác nhận liên tục mà không kiểm tra thực tế.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Photo rules */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Yêu cầu ảnh khi báo vấn đề</CardTitle>
              <CardDescription>
                Bắt buộc đính kèm ảnh để chuẩn hóa bằng chứng và giảm tranh chấp.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="p1" className="text-sm">Hỏng / Mất</Label>
                <Switch id="p1" checked={photoDamaged} onCheckedChange={setPhotoDamaged} disabled={!useLean} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="p2" className="text-sm">Thiếu / Cần bổ sung</Label>
                <Switch id="p2" checked={photoMissing} onCheckedChange={setPhotoMissing} disabled={!useLean} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="p3" className="text-sm">Tiêu hao có tính phí (minibar...)</Label>
                <Switch id="p3" checked={photoConsumed} onCheckedChange={setPhotoConsumed} disabled={!useLean} />
              </div>
            </CardContent>
          </Card>

          <RoomCheckSettingsHistory hotelId={hotelId} />

          <div className="flex justify-end sticky bottom-0 bg-background py-3">
            <Button onClick={handleSave} disabled={updateMut.isPending} size="lg">
              {updateMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Lưu cấu hình
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
