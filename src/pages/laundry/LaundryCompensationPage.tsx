import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  useCompensationBatches,
  useSettleBatchCompensation,
} from '@/hooks/useLaundryCompensation'

function formatDays(from?: string | null) {
  if (!from) return '—'
  const d = new Date(from)
  const ms = Date.now() - d.getTime()
  return `${Math.floor(ms / (1000 * 60 * 60 * 24))} ngày`
}

function fmtVnd(v?: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('vi-VN') + ' ₫'
}

export default function LaundryCompensationPage() {
  const { data, isLoading, isError } = useCompensationBatches()
  const settleMut = useSettleBatchCompensation()

  const [settleBatch, setSettleBatch] = useState<any | null>(null)
  const [amount, setAmount] = useState<string>('0')
  const [notes, setNotes] = useState('')

  const grouped = useMemo(() => {
    const list = data ?? []
    return {
      partial: list.filter((b: any) => b.status === 'partially_received'),
      needed: list.filter((b: any) => b.status === 'compensation_needed'),
    }
  }, [data])

  const openSettle = (b: any) => {
    setSettleBatch(b)
    setAmount(String(b.compensation_amount || 0))
    setNotes('')
  }

  const handleSettle = async () => {
    if (!settleBatch) return
    const num = Number(amount.replace(/[^0-9]/g, ''))
    if (!Number.isFinite(num) || num < 0) return
    await settleMut.mutateAsync({
      batchId: settleBatch.id,
      compensationAmount: num,
      notes: notes.trim() || undefined,
    })
    setSettleBatch(null)
  }

  return (
    <div className="container max-w-5xl mx-auto p-4 space-y-4">
      <PageHeader
        title="Đền bù lô giặt"
        description="Theo dõi các lô giặt nhận thiếu và xử lý đền bù với nhà cung cấp"
      />

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}

      {isError && (
        <div className="rounded-lg border p-4 text-sm text-destructive">
          Không tải được dữ liệu. Vui lòng thử lại.
        </div>
      )}

      {!isLoading && data && data.length === 0 && (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          Hiện chưa có lô giặt nào cần đền bù.
        </div>
      )}

      {grouped.needed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-red-600 mb-2">
            Cần đền bù ngay ({grouped.needed.length})
          </h2>
          <div className="border rounded-lg divide-y">
            {grouped.needed.map((b: any) => (
              <BatchRow key={b.id} batch={b} onSettle={() => openSettle(b)} highlight />
            ))}
          </div>
        </section>
      )}

      {grouped.partial.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-amber-600 mb-2">
            Đang nhận thiếu ({grouped.partial.length})
          </h2>
          <div className="border rounded-lg divide-y">
            {grouped.partial.map((b: any) => (
              <BatchRow key={b.id} batch={b} onSettle={() => openSettle(b)} />
            ))}
          </div>
        </section>
      )}

      <Dialog open={!!settleBatch} onOpenChange={(v) => !v && setSettleBatch(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chốt đền bù lô #{settleBatch?.batch_code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Số tiền đền bù (VND)</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1"
                placeholder="Lý do, đối chiếu với vendor..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleBatch(null)}>
              Huỷ
            </Button>
            <Button onClick={handleSettle} disabled={settleMut.isPending}>
              Chốt đền bù
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BatchRow({
  batch,
  onSettle,
  highlight,
}: {
  batch: any
  onSettle: () => void
  highlight?: boolean
}) {
  return (
    <div className="p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            to={`/laundry/batches/${batch.id}`}
            className="font-mono text-xs underline-offset-2 hover:underline"
          >
            #{batch.batch_code}
          </Link>
          {highlight && (
            <span className="text-[11px] text-red-600 font-semibold">
              Quá hạn đền bù
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Nhận thiếu: {formatDays(batch.partially_received_at)} ·
          Mất {batch.items_lost ?? 0} · Hỏng {batch.items_damaged ?? 0} ·
          Đề xuất: {fmtVnd(batch.compensation_amount)}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onSettle}>
        Chốt đền bù
      </Button>
    </div>
  )
}
