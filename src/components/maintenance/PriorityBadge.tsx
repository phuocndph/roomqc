import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface PriorityBadgeProps {
  priority: 'low' | 'medium' | 'high' | 'urgent'
  className?: string
}
const priorities = {
  urgent: { label: 'Khẩn cấp', style: 'bg-red-700 hover:bg-red-700' },
  high: { label: 'Ưu tiên cao', style: 'bg-orange-700 hover:bg-orange-700' },
  medium: { label: 'Trung bình', style: 'bg-amber-700 hover:bg-amber-700' },
  low: { label: 'Ưu tiên thấp', style: 'bg-slate-600 hover:bg-slate-600' },
}
export const PriorityBadge = ({ priority, className }: PriorityBadgeProps) => {
  const config = priorities[priority]
  return (
    <Badge
      className={cn(
        'whitespace-nowrap border-transparent text-white',
        config?.style || 'bg-slate-600 hover:bg-slate-600',
        className,
      )}
    >
      {config?.label || priority}
    </Badge>
  )
}
