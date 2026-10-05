import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface PriorityBadgeProps {
  priority: 'low' | 'medium' | 'high' | 'urgent'
  className?: string
}

export const PriorityBadge = ({ priority, className }: PriorityBadgeProps) => {
  const config = {
    urgent: {
      label: 'Khẩn cấp',
      icon: '🔴',
      className: 'bg-destructive text-destructive-foreground animate-pulse',
    },
    high: {
      label: 'Cao',
      icon: '🟠',
      className: 'bg-orange-500 text-white',
    },
    medium: {
      label: 'Trung bình',
      icon: '🟡',
      className: 'bg-yellow-500 text-white',
    },
    low: {
      label: 'Thấp',
      icon: '🟢',
      className: 'bg-green-500 text-white',
    },
  }

  const { label, icon, className: badgeClass } = config[priority]

  return (
    <Badge className={cn(badgeClass, className)}>
      <span className="mr-1">{icon}</span>
      {label}
    </Badge>
  )
}
