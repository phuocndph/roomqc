import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface MobileQuickStatsProps {
  icon: LucideIcon
  label: string
  value: string | number
  format?: 'number' | 'percentage' | 'currency'
  trend?: {
    value: number
    direction: 'up' | 'down' | 'neutral'
  }
  color?: string
  onClick?: () => void
  className?: string
}

export function MobileQuickStats({
  icon: Icon,
  label,
  value,
  format = 'number',
  trend,
  color = 'text-primary',
  onClick,
  className,
}: MobileQuickStatsProps) {
  const formatValue = (val: string | number) => {
    if (typeof val === 'string') return val
    
    switch (format) {
      case 'percentage':
        return `${val}%`
      case 'currency':
        return new Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(val)
      default:
        return new Intl.NumberFormat('vi-VN').format(val)
    }
  }

  const getTrendIcon = () => {
    if (!trend) return null
    switch (trend.direction) {
      case 'up':
        return <TrendingUp className="h-3 w-3" />
      case 'down':
        return <TrendingDown className="h-3 w-3" />
      default:
        return <Minus className="h-3 w-3" />
    }
  }

  const getTrendColor = () => {
    if (!trend) return ''
    switch (trend.direction) {
      case 'up':
        return 'text-green-600'
      case 'down':
        return 'text-red-600'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <Card
      className={cn(
        "transition-colors",
        onClick && "cursor-pointer hover:bg-accent",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate mb-1">
              {label}
            </p>
            <p className="text-xl font-bold tracking-tight">
              {formatValue(value)}
            </p>
            {trend && (
              <div className={cn("flex items-center gap-1 mt-1", getTrendColor())}>
                {getTrendIcon()}
                <span className="text-xs font-medium">
                  {Math.abs(trend.value)}%
                </span>
              </div>
            )}
          </div>
          <div className={cn("p-2 rounded-lg bg-muted", color)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
