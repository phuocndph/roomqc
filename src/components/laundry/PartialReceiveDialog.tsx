import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useMarkBatchPartiallyReceived } from '@/hooks/useLaundryCompensation'

export interface PartialReceiveItem {
  item_id: string
  item_name: string
  quantity_sent: number
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  batchId: string
  items: PartialReceiveItem[]
  onSuccess?: () => void
}

export function PartialReceiveDialog({
  open,
  onOpenChange,
  batchId,
  items,
  onSuccess,
}: Props) {
  const [received, setReceived] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const mut = useMarkBatchPartiallyReceived()

  useEffect(() => {
    if (open) {
      const init: Record<string, number> = {}
      for (const it of items) init[it.item_id] = it.quantity_sent
      setReceived(init)
      setNotes('')
    }
  }, [open, items])

  const setQty = (id: string, v: string) => {
    const n = Number(v.replace(/[^0-9]/g, ''))
    setReceived((p) => ({ ...p, [id]: Number.isFinite(n) ? n : 0 }))
  }

  const handleSubmit = async () => {
    const payload = items.map((it) => ({
      item_id: it.item_id,
      quantity: received[it.item_id] ?? 0,
    }))
    await mut.mutateAsync({
      batchId,
      itemsReceived: payload,
      notes: notes.trim() || undefined,
    })
    onSuccess?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nhận thiếu — Ghi nhận thực tế nhận về</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {items.map((it) => {
            const r = received[it.item_id] ?? 0
            const diff = it.quantity_sent - r
            return (
              <div
                key={it.item_id}
                className="flex items-center gap-3 border rounded-md p-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{it.item_name}</div>
                  <div className="text-xs text-muted-foreground">
                    Đã gửi: {it.quantity_sent}
                    {diff > 0 && (
                      <span className="ml-2 text-red-600">
                        Thiếu {diff}
                      </span>
                    )}
                  </div>
                </div>
                <Input
                  value={String(r)}
                  onChange={(e) => setQty(it.item_id, e.target.value)}
                  inputMode="numeric"
                  className="h-8 w-20"
                />
              </div>
            )
          })}
        </div>

        <div>
          <Label className="text-xs">Ghi chú (tuỳ chọn)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1"
            placeholder="Lý do thiếu, ghi chú với vendor..."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={handleSubmit} disabled={mut.isPending}>
            Ghi nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
