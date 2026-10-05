import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: 'waiting' | 'pending' | 'in_progress' | 'completed' | 'cancelled'
  className?: string
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const config = {
    waiting: {
      label: 'Đang chờ',
      className: 'bg-gray-500 text-white',
    },
    pending: {
      label: 'Tiếp nhận',
      className: 'bg-blue-500 text-white',
    },
    in_progress: {
      label: 'Đang kiểm tra',
      className: 'bg-yellow-500 text-white',
    },
    completed: {
      label: 'Hoàn thành',
      className: 'bg-green-500 text-white',
    },
    cancelled: {
      label: 'Đã hủy',
      className: 'bg-red-500 text-white',
    },
  }

  const { label, className: badgeClass } = config[status]

  return (
    <Badge className={cn(badgeClass, className)}>
      {label}
    </Badge>
  )
}
