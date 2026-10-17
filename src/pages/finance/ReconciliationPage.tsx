import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import { QueryErrorPanel } from '@/components/shared/QueryErrorPanel'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Eye } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

type AnomalyStatus = 'open' | 'resolved' | 'ignored'

interface Anomaly {
  id: string
  anomaly_type: 'unmatched' | 'amount_mismatch' | 'duplicate'
  status: AnomalyStatus
  sepay_tx_id: string
  sepay_reference: string | null
  sepay_content: string | null
  sepay_amount: number
  sepay_date: string | null
  expected_invoice_number: string | null
  expected_amount: number | null
  amount_diff: number | null
  resolution_note: string | null
  created_at: string
}

const TYPE_LABEL: Record<Anomaly['anomaly_type'], string> = {
  unmatched: 'Không khớp đơn',
  amount_mismatch: 'Lệch số tiền',
  duplicate: 'Trùng giao dịch',
}

const TYPE_COLOR: Record<Anomaly['anomaly_type'], string> = {
  unmatched: 'text-amber-600',
  amount_mismatch: 'text-red-600',
  duplicate: 'text-amber-600',
}

export default function ReconciliationPage() {
  const { tenantId } = useUser()
  const [tab, setTab] = useState<AnomalyStatus>('open')
  const [active, setActive] = useState<Anomaly | null>(null)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['payment-anomalies', tenantId, tab],
    queryFn: async (): Promise<Anomaly[]> => {
      if (!tenantId) return []
      const { data, error } = await supabase
        .from('payment_anomalies')
        .select('id,anomaly_type,status,sepay_tx_id,sepay_reference,sepay_content,sepay_amount,sepay_date,expected_invoice_number,expected_amount,amount_diff,resolution_note,created_at')
        .eq('tenant_id', tenantId)
        .eq('status', tab)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data || []) as Anomaly[]
    },
    enabled: !!tenantId,
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lịch sử đối soát thuê bao"
        description="Dữ liệu SePay cũ của thuê bao RoomQC, không phải các khoản thu của khách lưu trú."
      />
      <p className="rounded-md border p-3 text-sm" role="note">
        Chỉ tra cứu. Chưa hỗ trợ kết luận hoặc bỏ qua bất thường từ màn hình này.
        Vui lòng liên hệ quản trị RoomQC để kiểm tra; không chuyển khoản thêm.
        Trạng thái lịch sử không xác nhận đã thu tiền hoặc đã cấp gói.
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as AnomalyStatus)}>
        <TabsList>
          <TabsTrigger value="open">Cần xử lý</TabsTrigger>
          <TabsTrigger value="resolved">Đã xử lý</TabsTrigger>
          <TabsTrigger value="ignored">Bỏ qua</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isError ? (
            <QueryErrorPanel title="Không tải được lịch sử đối soát" onRetry={() => void refetch()} retrying={isFetching} />
          ) : isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
              {tab === 'open'
                ? 'Không có bản ghi trong phạm vi lịch sử đang xem. Đây không phải xác nhận mọi giao dịch đã khớp.'
                : 'Chưa có bản ghi.'}
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {data.map((a) => (
                <div key={a.id} className="p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`text-xs font-medium ${TYPE_COLOR[a.anomaly_type]}`}>
                        {TYPE_LABEL[a.anomaly_type]}
                      </span>
                      <span className="text-sm font-semibold">
                        {formatCurrency(a.sepay_amount)}
                      </span>
                      {a.amount_diff !== null && a.amount_diff !== 0 && (
                        <span className="text-xs text-red-600">
                          (lệch {a.amount_diff > 0 ? '+' : ''}{formatCurrency(a.amount_diff)})
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {a.sepay_date && format(new Date(a.sepay_date), 'dd/MM HH:mm', { locale: vi })}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      <span className="font-mono">{a.sepay_reference}</span>
                      {' · '}
                      {a.sepay_content || 'Không có nội dung'}
                    </div>
                    {a.expected_invoice_number && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Có thể khớp đơn: <span className="font-mono">{a.expected_invoice_number}</span>
                        {a.expected_amount !== null && (
                          <> ({formatCurrency(a.expected_amount)})</>
                        )}
                      </div>
                    )}
                    {a.resolution_note && (
                      <div className="text-xs text-muted-foreground mt-1 italic">
                        Ghi chú: {a.resolution_note}
                      </div>
                    )}
                  </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setActive(a)
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" /> Xem chi tiết
                    </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chi tiết bất thường — chỉ đọc</DialogTitle>
            <DialogDescription>Chứng từ lịch sử, không phải xác nhận thanh toán hoặc quyết định cấp gói.</DialogDescription>
          </DialogHeader>
          {active && (
            <div className="space-y-3 text-sm">
              <div className="border rounded p-3 space-y-1 bg-muted/30">
                <div className={TYPE_COLOR[active.anomaly_type]}>
                  {TYPE_LABEL[active.anomaly_type]}
                </div>
                <div>Số tiền: <strong>{formatCurrency(active.sepay_amount)}</strong></div>
                <div className="text-xs text-muted-foreground">
                  Mã GD: <span className="font-mono">{active.sepay_reference}</span>
                </div>
                <div className="text-xs">Nội dung: {active.sepay_content}</div>
                {active.expected_invoice_number && (
                  <div className="text-xs">
                    Đơn nghi: <span className="font-mono">{active.expected_invoice_number}</span>
                    {active.amount_diff !== null && (
                      <> · lệch {formatCurrency(active.amount_diff)}</>
                    )}
                  </div>
                )}
              </div>
              {active.resolution_note && <p>Ghi chú lịch sử: {active.resolution_note}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
