import { AlertCircle, Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function QueryErrorPanel({ title, onRetry, retrying = false }: {
  title: string
  onRetry: () => void
  retrying?: boolean
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>Không thể xác nhận dữ liệu hiện tại. Kiểm tra kết nối rồi thử lại.</AlertDescription>
      <Button type="button" variant="outline" className="mt-3" onClick={onRetry} disabled={retrying}>
        {retrying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {retrying ? 'Đang tải lại…' : 'Thử lại'}
      </Button>
    </Alert>
  )
}
