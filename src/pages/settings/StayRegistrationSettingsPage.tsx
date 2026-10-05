import { useEffect, useState } from 'react'
import { useHotelContext } from '@/contexts/HotelContext'
import { useHotel, useUpdateHotel } from '@/hooks/useHotels'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Link } from 'react-router-dom'

interface TbltkbttConfig {
  enabled?: boolean
  endpoint_url?: string
  account?: string
  token?: string
  establishment_code?: string
  mode?: 'live' | 'dry_run'
}

const EMPTY: TbltkbttConfig = {
  enabled: false,
  endpoint_url: '',
  account: '',
  token: '',
  establishment_code: '',
  mode: 'dry_run',
}

export default function StayRegistrationSettingsPage() {
  const { selectedHotel } = useHotelContext()
  const { data: hotel, isLoading } = useHotel(selectedHotel?.id)
  const updateHotel = useUpdateHotel()
  const [cfg, setCfg] = useState<TbltkbttConfig>(EMPTY)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (hotel) {
      setCfg({ ...EMPTY, ...((hotel as any).tbltkbtt_config ?? {}) })
      setDirty(false)
    }
  }, [hotel])

  if (!selectedHotel) {
    return (
      <div className="p-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Vui lòng chọn một khách sạn cụ thể.</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Đang tải…</div>
  }

  const set = <K extends keyof TbltkbttConfig>(k: K, v: TbltkbttConfig[K]) => {
    setCfg((p) => ({ ...p, [k]: v }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (cfg.enabled && (!cfg.endpoint_url || !cfg.establishment_code)) {
      return
    }
    await updateHotel.mutateAsync({
      id: selectedHotel.id,
      data: { tbltkbtt_config: cfg } as any,
    })
    setDirty(false)
  }

  const canSave = !cfg.enabled || (!!cfg.endpoint_url && !!cfg.establishment_code)

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Khai báo lưu trú (tbltkbtt)</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cấu hình kết nối hệ thống Khai báo tạm trú của Bộ Công an —{' '}
            <span className="font-medium">{selectedHotel.name}</span>
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link to="/legal/stay-registrations">
            Xem hàng đợi <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Bắt buộc với tất cả cơ sở lưu trú từ tháng 5/2026. Khi bật, mỗi lần
          check-in hệ thống sẽ tự đưa khách vào hàng đợi và gửi BCA mỗi 2 phút.
          Chế độ <strong>Thử (dry_run)</strong> chỉ đánh dấu đã gửi, không gọi BCA — dùng để test.
        </AlertDescription>
      </Alert>

      <div className="border rounded-lg divide-y">
        <div className="p-4 flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Bật khai báo tự động</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tự đưa khách vào hàng đợi sau mỗi lần check-in
            </p>
          </div>
          <Switch checked={!!cfg.enabled} onCheckedChange={(v) => set('enabled', v)} />
        </div>

        <div className="p-4 grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Endpoint URL <span className="text-red-600">*</span></Label>
            <Input
              className="h-8 font-mono text-xs"
              placeholder="https://tbltkbtt.gov.vn/api/v1/registrations"
              value={cfg.endpoint_url ?? ''}
              onChange={(e) => set('endpoint_url', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Mã cơ sở lưu trú <span className="text-red-600">*</span></Label>
            <Input
              className="h-8 font-mono text-xs"
              placeholder="CS123456"
              value={cfg.establishment_code ?? ''}
              onChange={(e) => set('establishment_code', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Chế độ gửi</Label>
            <Select value={cfg.mode ?? 'dry_run'} onValueChange={(v) => set('mode', v as any)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dry_run">Thử (dry_run) – không gửi BCA</SelectItem>
                <SelectItem value="live">Chính thức (live) – gửi BCA</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Tài khoản</Label>
            <Input
              className="h-8 font-mono text-xs"
              placeholder="Tài khoản BCA cấp"
              value={cfg.account ?? ''}
              onChange={(e) => set('account', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Token / API key</Label>
            <Input
              className="h-8 font-mono text-xs"
              type="password"
              placeholder="••••••••"
              value={cfg.token ?? ''}
              onChange={(e) => set('token', e.target.value)}
            />
          </div>
        </div>

        <div className="p-3 flex items-center justify-between bg-muted/30">
          <div className="text-xs text-muted-foreground">
            {dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu'}
            {cfg.enabled && !canSave && (
              <span className="text-red-600 ml-2">Cần điền Endpoint và Mã cơ sở</span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={handleSave}
            disabled={!dirty || !canSave || updateHotel.isPending}
          >
            {updateHotel.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Lưu cấu hình
          </Button>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-2 text-xs text-muted-foreground">
        <div className="font-medium text-foreground text-sm">Hướng dẫn</div>
        <ol className="list-decimal list-inside space-y-1">
          <li>Đăng ký tài khoản với Công an địa phương để được cấp endpoint, mã cơ sở và token.</li>
          <li>Bắt đầu bằng chế độ <em>Thử</em> để kiểm tra dữ liệu khách (BCA fields đầy đủ chưa).</li>
          <li>Khi sẵn sàng, chuyển sang <em>Chính thức</em> — hệ thống sẽ gửi BCA mỗi 2 phút.</li>
          <li>Theo dõi & gửi lại các bản ghi thất bại tại <Link to="/legal/stay-registrations" className="underline">Hàng đợi khai báo</Link>.</li>
        </ol>
      </div>
    </div>
  )
}
