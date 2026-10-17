import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: 'waiting' | 'pending' | 'in_progress' | 'completed' | 'cancelled'
  className?: string
}
const statuses = {
  waiting: { label: 'Chờ tiếp nhận', style: 'bg-slate-600 hover:bg-slate-600' },
  pending: { label: 'Đã tiếp nhận', style: 'bg-blue-700 hover:bg-blue-700' },
  in_progress: {
    label: 'Đang xử lý',
    style: 'bg-amber-700 hover:bg-amber-700',
  },
  completed: { label: 'Hoàn thành', style: 'bg-green-700 hover:bg-green-700' },
  cancelled: { label: 'Đã hủy', style: 'bg-slate-600 hover:bg-slate-600' },
}
export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const config = statuses[status]
  return (
    <Badge
      className={cn(
        'whitespace-nowrap border-transparent text-white',
        config?.style || 'bg-slate-600 hover:bg-slate-600',
        className,
      )}
    >
      {config?.label || status}
    </Badge>
  )
}
