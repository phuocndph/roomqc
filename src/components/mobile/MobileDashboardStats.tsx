import React from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  icon: LucideIcon
  title: string
  value: string | number
  trend?: string
  variant?: 'default' | 'warning' | 'success' | 'destructive'
  className?: string
  onClick?: () => void
}

export function MobileStatCard({
  icon: Icon,
  title,
  value,
  trend,
  variant = 'default',
  className,
  onClick
}: StatCardProps) {
  const variantStyles = {
    default: 'border-border bg-card',
    warning: 'border-orange-200 bg-orange-50 dark:bg-orange-950',
    success: 'border-green-200 bg-green-50 dark:bg-green-950',
    destructive: 'border-red-200 bg-red-50 dark:bg-red-950'
  }

  const iconStyles = {
    default: 'text-primary',
    warning: 'text-orange-600 dark:text-orange-400',
    success: 'text-green-600 dark:text-green-400',
    destructive: 'text-red-600 dark:text-red-400'
  }

  return (
    <Card
      className={cn(
        'min-w-[160px] max-w-[180px] p-4 snap-start transition-all',
        variantStyles[variant],
        onClick && 'cursor-pointer active:scale-95',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <Icon className={cn('h-5 w-5 flex-shrink-0', iconStyles[variant])} />
        {trend && (
          <span className={cn(
            'text-xs font-medium whitespace-nowrap',
            trend.startsWith('+') ? 'text-green-600' : 'text-red-600'
          )}>
            {trend}
          </span>
        )}
      </div>
      <p className="text-xl font-bold break-words">{value}</p>
      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{title}</p>
    </Card>
  )
}

interface StatScrollContainerProps {
  children: React.ReactNode
  className?: string
}

export function StatScrollContainer({ children, className }: StatScrollContainerProps) {
  return (
    <div className="w-full -mx-4 px-4">
      <div className={cn(
        'flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory',
        'scrollbar-hide',
        className
      )}>
        {children}
      </div>
    </div>
  )
}
