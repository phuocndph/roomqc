import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import { getFriendlyError } from '@/lib/errorMessage'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { RefreshCw, Check, Eye } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

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
  const { toast } = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState<AnomalyStatus>('open')
  const [active, setActive] = useState<Anomaly | null>(null)
  const [note, setNote] = useState('')
  const [syncing, setSyncing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['payment-anomalies', tenantId, tab],
    queryFn: async (): Promise<Anomaly[]> => {
      if (!tenantId) return []
      const { data, error } = await supabase
        .from('payment_anomalies')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', tab)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data || []) as Anomaly[]
    },
    enabled: !!tenantId,
  })

  const resolveMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      note,
    }: {
      id: string
      status: 'resolved' | 'ignored'
      note: string
    }) => {
      const { error } = await supabase
        .from('payment_anomalies')
        .update({
          status,
          resolution_note: note || null,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-anomalies'] })
      toast({ title: 'Đã cập nhật', description: 'Trạng thái bất thường đã thay đổi.' })
      setActive(null)
      setNote('')
    },
    onError: (e: Error) => toast({ title: 'Lỗi', description: getFriendlyError(e), variant: 'destructive' }),
  })

  const triggerSync = async () => {
    setSyncing(true)
    try {
      const { data, error } = await supabase.functions.invoke('sync-sepay-transactions', {})
      if (error) throw error
      toast({
        title: 'Đối soát xong',
        description: `Khớp ${data?.matched ?? 0} giao dịch, ${data?.anomalies ?? 0} bất thường.`,
      })
      qc.invalidateQueries({ queryKey: ['payment-anomalies'] })
    } catch (e: any) {
      toast({ title: 'Lỗi đối soát', description: e?.message || 'Không xác định', variant: 'destructive' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Đối soát thanh toán"
        description="Các giao dịch SePay không khớp với đơn hàng cần được xử lý."
      >
        <Button onClick={triggerSync} disabled={syncing} size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          Đối soát ngay
        </Button>
      </PageHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as AnomalyStatus)}>
        <TabsList>
          <TabsTrigger value="open">Cần xử lý</TabsTrigger>
          <TabsTrigger value="resolved">Đã xử lý</TabsTrigger>
          <TabsTrigger value="ignored">Bỏ qua</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
              {tab === 'open'
                ? 'Tuyệt vời — không có bất thường nào cần xử lý.'
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
                  {tab === 'open' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setActive(a)
                        setNote('')
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" /> Xử lý
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xử lý bất thường</DialogTitle>
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
              <Textarea
                placeholder="Ghi chú xử lý (tùy chọn): vd. đã liên hệ khách, đã ghi nhận thủ công…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                active &&
                resolveMutation.mutate({ id: active.id, status: 'ignored', note })
              }
              disabled={resolveMutation.isPending}
            >
              Bỏ qua
            </Button>
            <Button
              onClick={() =>
                active &&
                resolveMutation.mutate({ id: active.id, status: 'resolved', note })
              }
              disabled={resolveMutation.isPending}
            >
              <Check className="h-4 w-4 mr-1" /> Đánh dấu đã xử lý
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
