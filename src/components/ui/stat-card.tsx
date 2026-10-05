import { LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface StatCardProps {
  title: string
  value: string | number
  description?: string
  icon: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  change?: {
    value: number | null
    label: string
  }
  isLoading?: boolean
}

export const StatCard = ({ title, value, description, icon: Icon, trend, change, isLoading }: StatCardProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-3 border rounded-lg">
        <Skeleton className="h-8 w-8 rounded" />
        <div className="flex-1">
          <Skeleton className="h-3 w-16 mb-1" />
          <Skeleton className="h-5 w-12" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{title}</p>
        <p className="text-xl font-semibold">{value}</p>
        {description && (
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        )}
        {trend && (
          <p className={`text-xs ${trend.isPositive ? 'text-green-600' : 'text-destructive'}`}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </p>
        )}
        {change && change.value !== null && (
          <p className={`text-xs ${change.value >= 0 ? 'text-green-600' : 'text-destructive'}`}>
            {change.value >= 0 ? '↑' : '↓'} {Math.abs(change.value)}% {change.label}
          </p>
        )}
      </div>
    </div>
  )
}
