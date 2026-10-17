import { Button } from '@/components/ui/button'

export interface PanelQueryState {
  loading?: boolean
  isError?: boolean
  onRetry?: () => void
}

export function PanelError({ onRetry }: Pick<PanelQueryState, 'onRetry'>) {
  return <div role="alert" className="space-y-2 px-3 py-4 text-center">
    <p className="text-sm">Chưa tải được dữ liệu. Vui lòng thử lại.</p>
    {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Thử lại</Button>}
  </div>
}
