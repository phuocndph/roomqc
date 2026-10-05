import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useItems } from '@/hooks/useItems'
import { useHotelContext } from '@/contexts/HotelContext'
import { useCreateLinenBatch, useLinenBatches } from '@/hooks/useLaundryCompensation'

export default function NewLinenBatchPage() {
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const { data: itemsData, isLoading: itemsLoading } = useItems()
  const linenItems = useMemo(() => {
    const arr: any[] = Array.isArray(itemsData)
      ? (itemsData as any[])
      : ((itemsData as any)?.items ?? [])
    return arr.filter((i) => i.item_type === 'linen')
  }, [itemsData])

  const [itemId, setItemId] = useState<string>('')
  const [quantity, setQuantity] = useState<string>('10')
  const [batchCode, setBatchCode] = useState<string>('')

  const createMut = useCreateLinenBatch()
  const { data: existingBatches } = useLinenBatches(itemId || undefined)

  const canSubmit =
    !!itemId &&
    !!selectedHotel?.id &&
    Number(quantity) > 0 &&
    batchCode.trim().length >= 2 &&
    !isAllHotelsMode

  const handleSubmit = async () => {
    if (!canSubmit) return
    await createMut.mutateAsync({
      itemId,
      quantity: Number(quantity),
      batchCode: batchCode.trim(),
      hotelId: selectedHotel!.id,
    })
    setBatchCode('')
    setQuantity('10')
  }

  return (
    <div className="container max-w-3xl mx-auto p-4 space-y-4">
      <PageHeader
        title="Nhập lô khăn / linen mới"
        description="Tạo lô mới với số vòng giặt = 0. Hệ thống sẽ ưu tiên dùng lô cũ trước (FIFO)."
      />

      {isAllHotelsMode && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-300">
          Vui lòng chọn 1 khách sạn cụ thể để nhập lô.
        </div>
      )}

      <div className="border rounded-lg p-4 space-y-3">
        <div>
          <Label className="text-xs">Loại khăn / linen</Label>
          {itemsLoading ? (
            <Skeleton className="h-9 mt-1" />
          ) : (
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue placeholder="— Chọn —" />
              </SelectTrigger>
              <SelectContent>
                {linenItems.map((it: any) => (
                  <SelectItem key={it.id} value={it.id}>
                    {it.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Số lượng</Label>
            <Input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              className="h-9 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Mã lô</Label>
            <Input
              value={batchCode}
              onChange={(e) => setBatchCode(e.target.value)}
              placeholder="VD: LIN-2026-001"
              className="h-9 mt-1"
            />
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={!canSubmit || createMut.isPending}>
          Tạo lô mới
        </Button>
      </div>

      {itemId && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Các lô hiện có</h3>
          <div className="border rounded-lg divide-y">
            {(existingBatches ?? []).length === 0 && (
              <div className="p-4 text-xs text-muted-foreground text-center">
                Chưa có lô nào.
              </div>
            )}
            {(existingBatches ?? []).map((b: any) => (
              <div key={b.id} className="p-3 flex items-center gap-3 text-xs">
                <span className="font-mono">#{b.batch_code}</span>
                <span className="text-muted-foreground">
                  Còn {b.quantity_available}/{b.quantity_initial}
                </span>
                <span className="text-muted-foreground">
                  Vòng giặt: {b.wash_cycles}
                </span>
                <span className="ml-auto text-muted-foreground">
                  {new Date(b.received_at).toLocaleDateString('vi-VN')}
                </span>
                {b.retired_at && (
                  <span className="text-red-600">Đã loại</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
