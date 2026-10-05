import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { useHotelContext } from '@/contexts/HotelContext'
import { useStayRegistrations, useRetryStayRegistration, type StayRegistrationStatus } from '@/hooks/useStayRegistrations'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const STATUS_LABEL: Record<StayRegistrationStatus, { label: string; cls: string }> = {
  pending: { label: 'Chờ gửi', cls: 'text-amber-600' },
  submitting: { label: 'Đang gửi', cls: 'text-blue-600' },
  submitted: { label: 'Đã gửi', cls: 'text-blue-600' },
  acked: { label: 'BCA xác nhận', cls: 'text-green-600' },
  failed: { label: 'Thất bại', cls: 'text-red-600' },
  manual: { label: 'Cần làm tay', cls: 'text-muted-foreground' },
}

export default function StayRegistrationsPage() {
  const { selectedHotel } = useHotelContext()
  const [status, setStatus] = useState<StayRegistrationStatus | 'all'>('all')
  const { data, isLoading } = useStayRegistrations({ hotelId: selectedHotel?.id ?? null, status })
  const retry = useRetryStayRegistration()

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Khai báo lưu trú</h1>
          <p className="text-sm text-muted-foreground">
            Theo dõi & gửi lại các bản ghi khai báo cho Bộ Công An (tbltkbtt).
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link to="/settings/legal/stay-registration">
            <Settings className="h-3.5 w-3.5 mr-1" /> Cấu hình BCA
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="h-8 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground">{data?.length ?? 0} bản ghi</div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">Khách</th>
                <th className="p-3 font-medium">CMND/CCCD</th>
                <th className="p-3 font-medium">Phòng</th>
                <th className="p-3 font-medium">Check-in</th>
                <th className="p-3 font-medium">Trạng thái</th>
                <th className="p-3 font-medium">Lỗi</th>
                <th className="p-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {data?.map((r) => {
                const s = STATUS_LABEL[r.status]
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{r.guests?.full_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.guests?.nationality ?? ''}</div>
                    </td>
                    <td className="p-3 font-mono text-xs">{r.guests?.id_number ?? '—'}</td>
                    <td className="p-3 font-mono text-xs">{r.room_number}</td>
                    <td className="p-3 text-xs">{new Date(r.check_in_at).toLocaleString('vi-VN')}</td>
                    <td className={`p-3 text-xs font-medium ${s.cls}`}>
                      {s.label}
                      {r.attempt_count > 0 && (
                        <span className="ml-1 text-muted-foreground">(×{r.attempt_count})</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-red-600 max-w-xs truncate" title={r.last_error ?? ''}>
                      {r.last_error}
                    </td>
                    <td className="p-3 text-right">
                      {(r.status === 'failed' || r.status === 'manual') && (
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(r.id)}
                        >
                          Gửi lại
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!data?.length && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">
                    Chưa có bản ghi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
