import { useState } from 'react'
import { useShiftHistory, formatDuration } from '@/hooks/useShiftHistory'
import { useUser } from '@/hooks/useUser'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { generateShiftHandoverPDF } from '@/lib/shiftHandoverPdf'
import { Download, FileText, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

export default function ShiftHandoverPage() {
  const { user } = useUser()
  const level = (user as any)?.position?.user_level_code
  const canSeeAll = level === 'super_admin' || level === 'tenant_owner' || level === 'manager'

  // Staff: chỉ xem ca của mình. Manager/Owner: xem toàn bộ.
  const { data: shifts, isLoading } = useShiftHistory({
    userId: canSeeAll ? null : user?.id,
  })

  const [exportingId, setExportingId] = useState<string | null>(null)
  const { toast } = useToast()

  const handleExport = async (shiftId: string) => {
    setExportingId(shiftId)
    try {
      await generateShiftHandoverPDF(shiftId)
      toast({ title: 'Đã tải báo cáo PDF' })
    } catch (e: any) {
      toast({
        title: 'Không tải được báo cáo',
        description: e?.message || 'Vui lòng thử lại',
        variant: 'destructive',
      })
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div className="container max-w-5xl py-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Báo cáo bàn giao cuối ca</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tải báo cáo PDF danh sách giao dịch và số tiền theo phương thức thanh toán cho từng ca làm việc.
          {!canSeeAll && ' Bạn chỉ thấy ca làm việc của mình.'}
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Đang tải...</div>
      ) : !shifts || shifts.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Chưa có ca làm việc nào.
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {shifts.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium truncate">
                    {s.user?.full_name || 'Lễ tân'}
                  </span>
                  {s.hotel?.name && (
                    <span className="text-xs text-muted-foreground truncate">
                      · {s.hotel.name}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                  {format(new Date(s.start_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                  {' → '}
                  {format(new Date(s.end_at), 'HH:mm', { locale: vi })}
                  <span className="ml-2">({formatDuration(s.duration_minutes || 0)})</span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={exportingId === s.id}
                onClick={() => handleExport(s.id)}
              >
                {exportingId === s.id ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1" />
                )}
                PDF
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
