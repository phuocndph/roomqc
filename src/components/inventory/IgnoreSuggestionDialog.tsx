import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useIgnoreReorderSuggestion } from '@/hooks/useReorderSuggestions'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  suggestionId: string | null
  itemName?: string
}

export function IgnoreSuggestionDialog({ open, onOpenChange, suggestionId, itemName }: Props) {
  const [reason, setReason] = useState('')
  const [days, setDays] = useState(7)
  const ignore = useIgnoreReorderSuggestion()

  const handleSubmit = async () => {
    if (!suggestionId) return
    await ignore.mutateAsync({ suggestionId, reason: reason.trim() || undefined, ignoreDays: days })
    setReason('')
    setDays(7)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bỏ qua đề xuất</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {itemName && (
            <div className="text-sm text-muted-foreground">
              Item: <span className="font-medium text-foreground">{itemName}</span>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="reason" className="text-xs">Lý do (không bắt buộc)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Vd: Đã mua chỗ khác, đang xem xét vendor mới..."
              className="text-sm"
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="days" className="text-xs">Bỏ qua trong (ngày)</Label>
            <Input
              id="days"
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Math.max(1, parseInt(e.target.value || '7', 10)))}
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">
              Sau khoảng thời gian này, đề xuất sẽ tự động xuất hiện lại nếu vẫn dưới mức tối thiểu.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={ignore.isPending}>
            {ignore.isPending ? 'Đang lưu...' : 'Xác nhận bỏ qua'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
