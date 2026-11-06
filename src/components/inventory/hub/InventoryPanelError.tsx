import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function InventoryPanelError({ onRetry, message = 'Không tải được dữ liệu kho.' }: { onRetry: () => void; message?: string }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-4">
    <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{message}</p>
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>Thử lại</Button>
  </div>
}
